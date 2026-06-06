# Moonwave Music — Firebase 멀티유저 공유 버전 구현 계획

작성일: 2026-06-06 · 대상: 현재 로컬 v1.0 → 온라인 공유 v2.0

---

## 1. 목표

여러 사용자가 **로그인**해서 자기 곡을 **업로드·공유**하고, 다른 사람의 **공개 곡을 감상**하는
온라인 음악 서비스 (music.moonwave.kr). Health v1.0 의 Firebase 패턴(Auth + Firestore +
보안 규칙으로 per-user 격리)을 그대로 계승하고, 음원은 Firebase Storage 에 둔다.

**비목표(이번 범위 아님)**: 소셜 기능(팔로우·댓글·플레이리스트 공유), 추천 알고리즘, 결제.

---

## 2. 스택 결정

| 항목 | 선택 | 이유 |
|---|---|---|
| 인증 | **Firebase Auth** (Google) | Health 와 동일 — `AuthContext`/`LoginScreen` 재사용 |
| 메타데이터 DB | **Firestore** | Health 와 동일 NoSQL 문서·보안 규칙 패턴 |
| 음원 저장 | **Firebase Storage** | `getDownloadURL` 이 Range 요청 지원 → `<audio>` 시킹 그대로 동작, 별도 스트리밍 프록시 불필요 |
| 호스팅 | **Vercel** (Health 와 동일) | — |

> Supabase 미채택: 음악 공유엔 pgvector(Supabase 최대 강점)가 불필요하고, Health 가
> 이미 Firebase Auth/Firestore 를 쓰므로 스택 이원화 비용만 늘어남.

**아키텍처 방향**: Health 처럼 **클라이언트 Firebase SDK 직결 + 보안 규칙**으로 접근 제어.
현재의 Next.js API 라우트(`/api/stream`·`/api/upload`·`/api/albums`·`/api/tracks/move`·
`/api/lyrics`)는 **대부분 제거**되고 클라이언트의 Firestore/Storage 호출로 대체된다.
(예외: AI 가사 싱크 `/api/lyrics/[id]/align` 은 OpenAI 키가 서버 전용이라 **유지**하되,
입력을 로컬 파일 경로 대신 Storage URL/업로드 스트림으로 변경.)

---

## 3. 데이터 모델 (Firestore)

```
tracks/{trackId}
  ownerUid: string            // 업로더
  title: string
  artist: string              // 기본 = 업로더 표시명, 편집 가능
  album: string               // "" = 싱글
  visibility: "public" | "private"
  duration: number
  sizeBytes: number
  sampleRate, channels, bitsPerSample: number   // WAV 메타(있으면)
  storagePath: string         // gs 경로: tracks/{ownerUid}/{trackId}/original.wav
  streamPath: string|null     // 변환된 mp3 경로(있으면) — 스트리밍 우선 사용
  lyrics: string|null         // LRC/텍스트 (사이드카 → 필드로 흡수)
  lyricsFormat: "lrc"|"txt"|null
  createdAt, updatedAt: serverTimestamp

users/{uid}
  displayName, photoURL
  createdAt

users/{uid}/favorites/{trackId}   // 존재=즐겨찾기 (또는 배열 필드)
  at: serverTimestamp

users/{uid}/playEvents/{autoId}    // 재생 이력 (또는 집계 문서)
  trackId: string
  at: serverTimestamp
users/{uid}/stats/summary          // playCounts 맵 집계(읽기 비용 절감)
  counts: { [trackId]: number }
```

설계 노트:
- **앨범**은 별도 컬렉션 없이 `tracks.album` 문자열로 그룹(현재와 동일 모델 유지) — 쿼리:
  `where ownerUid == uid` 후 클라이언트에서 album 별 그룹핑, 또는 공개 탐색은
  `where visibility == "public"`.
- **가사**는 파일 사이드카에서 **Firestore 필드**로 이동(공유 시 파일시스템이 없으므로).
- **재생수**: per-play 문서는 비용↑ → `stats/summary` 집계 맵 + 최근 N건만 `playEvents`.

---

## 4. 보안 규칙 (Firestore)

```
match /tracks/{id} {
  allow read: if resource.data.visibility == "public"
              || (request.auth != null && resource.data.ownerUid == request.auth.uid);
  allow create: if request.auth != null
              && request.resource.data.ownerUid == request.auth.uid;
  allow update, delete: if request.auth != null
              && resource.data.ownerUid == request.auth.uid;
}
match /users/{uid}/{document=**} {
  allow read, write: if request.auth != null && request.auth.uid == uid;
}
```

Storage 규칙:
```
match /tracks/{ownerUid}/{trackId}/{file} {
  allow write: if request.auth != null && request.auth.uid == ownerUid
            && request.resource.size < 1024*1024*1024;   // 1GB
  allow read: if true;   // 공개 스트리밍 (비공개곡 보호는 4단계 참고)
}
```
⚠️ **비공개곡 음원 보호**: Storage 규칙만으로는 trackId 를 아는 사람이 파일을 받을 수 있음.
완전 비공개가 필요하면 (a) 비공개곡은 **signed URL**(짧은 만료) 발급용 경량 API 라우트 추가,
또는 (b) 비공개곡 경로를 추측 불가능한 토큰으로. 1차 버전은 "공개 위주"라면 단순 공개 읽기로
시작하고, 비공개 강결합은 후속으로.

---

## 5. 음원 저장 & 변환 (핵심 비용 포인트)

WAV = 곡당 ~40MB. 다중 사용자 스트리밍 시 **전송(egress) 비용이 변동비의 대부분**.

전략 (권장 → 단순 순):
1. **mp3 변환 스트리밍 + WAV 원본 보관** (권장)
   - 업로드 시 mp3(192k, ~4MB) 생성 → `streamPath` 에 저장, 재생은 mp3.
   - WAV 는 원본 보관·다운로드용.
   - 변환 위치 후보:
     - **ffmpeg.wasm (브라우저)**: 서버 불필요·무료, 단 업로드 시 수십 초 CPU.
     - **Cloud Function + ffmpeg (서버)**: 안정적, Blaze 요금제·함수 비용.
   - 대역폭 **약 10배 절감**.
2. **WAV 그대로 스트리밍** (단순)
   - 변환 없음. 구현 최단. 단 전송 비용 10배. 청취자 적으면 감수 가능.

→ **결정 필요**: 변환 도입 여부 / 변환 위치(브라우저 vs 함수). (아래 9 참고)

---

## 6. 현재 코드 → v2 매핑

| 현재 (로컬) | v2 (Firebase) | 작업 |
|---|---|---|
| `lib/tracks.server.ts` (폴더 스캔) | Firestore 쿼리 훅 `useTracks`(내 곡)·`usePublicTracks` | 신규, 스캐너 제거 |
| `api/stream/[id]` (로컬 Range) | `getDownloadURL` → `<audio src>` | 라우트 제거 |
| `api/upload` (로컬 쓰기) | Storage `uploadBytes` + Firestore `addDoc`(+mp3 변환) | 라우트 제거·클라 업로드 |
| `api/albums`·`api/tracks/move` | Firestore `updateDoc`(album 필드) | 라우트 제거 |
| `api/lyrics/[id]` (사이드카) | Firestore `tracks.lyrics` 필드 update | 라우트 제거 |
| `api/lyrics/[id]/align` (OpenAI) | **유지** — 입력만 Storage URL 로 | 수정 |
| `contexts/TracksContext` | Firestore 구독 기반으로 재작성 | 수정 |
| `stores/usePlayerStore` (localStorage persist) | 재생 상태는 그대로 휘발, **favorites·playCounts 는 Firestore 동기화** | 수정 |
| `components/app/AppShell` | **AuthProvider + 로그인 게이트** 추가(Health 패턴) | 수정 |
| — | `AuthContext`·`LoginScreen` (Health 에서 이식) | 신규 |
| `lib/firebase.ts`, 보안 규칙, `.env.local` | Health 에서 이식·신규 | 신규 |
| `music-fs.ts`, `audio-resample.ts` | 로컬 전용 — 제거 또는 변환 함수만 잔존 | 정리 |

탐색 UI 추가: "둘러보기"(공개 곡) 페이지 — 다른 사용자의 public 트랙 목록.

---

## 7. 비용 추정 (Firebase Blaze, 2026 기준 개략 — 실제 단가는 콘솔에서 재확인 필요)

| 항목 | 단가(개략) | 예시 |
|---|---|---|
| Storage 보관 | ~$0.026/GB/월 | 100곡 WAV ≈ 4GB → ~$0.10/월 |
| **전송(egress)** | ~$0.12/GB | WAV 1재생 40MB ≈ $0.005 · **mp3 1재생 4MB ≈ $0.0005** |
| Firestore | 읽기/쓰기 소액 | 소규모는 사실상 무료 한도 내 |
| Auth | 무료 | — |

→ 변동비 = **전송**. 청취 1,000회 기준: WAV ≈ $5, mp3 ≈ $0.5. **mp3 변환이 비용 핵심.**
무료 Spark 요금제는 Storage/함수 제약이 커서 **Blaze(종량제) 필요**.

---

## 8. 구현 단계 (빌드 순서)

1. **기반**: Firebase 프로젝트 생성, `lib/firebase.ts`·`AuthContext`·`LoginScreen` 이식,
   AppShell 인증 게이트. (로그인되면 빈 보관함)
2. **업로드·저장**: Storage 업로드 + `tracks` 문서 생성. (변환 정책 6단계 반영)
3. **내 보관함**: Firestore 내 곡 구독 → 기존 보관함 UI 연결(앨범 그룹 유지). 재생은 download URL.
4. **per-user 데이터**: 즐겨찾기·재생수·통계를 Firestore 로. (홈·통계 페이지 연결)
5. **공유/탐색**: visibility 토글 + "둘러보기"(공개 곡) 페이지.
6. **가사**: 사이드카 → Firestore 필드. AI 싱크 라우트를 Storage 입력으로 수정.
7. **보안 규칙 배포·검증**, Vercel 배포, 도메인 연결.

각 단계는 독립 배포 가능(점진적). 1~3 까지가 "내 음악 클라우드", 5 부터가 "공유".

---

## 9. 진행 전 확정할 결정

1. **음원 변환**: mp3 변환 스트리밍 도입? (권장 O) / 변환 위치: 브라우저(ffmpeg.wasm) vs Cloud Function?
2. **비공개곡**: 1차에 완전 비공개(signed URL) 포함? 아니면 공개 위주로 단순 시작?
3. **Firebase 프로젝트**: 새로 만들지 / Health 와 별도 프로젝트(권장 — 요금·규칙 분리).
4. **로컬 v1 유지**: 현재 로컬 버전은 그대로 두고 v2 를 별도 디렉토리/브랜치로? (권장)

---

## 10. 리스크 / 솔직한 평가

- **규모**: 데이터 레이어 전면 교체 = 실질 v2. 현재 기능(플레이어·앨범·가사·AI싱크 UI)은
  대부분 재사용되지만, 데이터 소스가 전부 바뀜.
- **비용**: 무료가 아님(Blaze). 청취량에 비례하는 전송비 — mp3 변환으로 완화.
- **저작권**: 타인 공유 = 업로드 곡의 권리 확인 필요(서비스로 공개 시). 개인/지인 공유면 영향 적음.
- **현재 로컬 앱의 강점(키 불필요·오프라인·프라이버시)은 사라짐** — 공유 목적과의 트레이드오프.
```
