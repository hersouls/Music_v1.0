# Moonwave Music v1.0

## Project Overview
멀티유저 음악 공유 서비스 (music.moonwave.kr) — Google 로그인 후 내 곡을 업로드·공유하고, 다른 사용자의 공개 곡을 감상. **Health v1.0 의 Foundation Design System UI/UX 를 100% 계승** (BORA parity, light-only).

## Tech Stack
- **Framework**: Next.js 16 (App Router) + React 19 + TypeScript 5.9
- **Styling**: Tailwind CSS v4 (CSS-first) + Foundation Design System (Health/BORA 에서 그대로 복사) + Framer Motion
- **UI**: Headless UI, lucide-react, 의존성 0 SVG 차트 (RingProgress/BarChart/Sparkline)
- **백엔드**: Firebase (프로젝트 `moonwave-music-v1`, 서울 리전) — Auth(Google) + Firestore(메타·가사·청취 데이터) + Storage(음원). **클라이언트 SDK 직결 + 보안 규칙** (Health 패턴) — 서버 API 는 AI 가사 싱크 1개뿐
- **상태**: zustand (player/toast/dialog) — 재생 환경설정(볼륨·셔플 등)은 `persist` 로 localStorage, **청취 데이터(즐겨찾기·재생수·최근재생)는 Firestore `users/{uid}/data/listening` 동기화** (`lib/listening-sync.ts`, 디바운스 양방향)
- **오디오**: HTMLAudioElement 싱글톤 + Web Audio AnalyserNode(비주얼라이저) + Media Session API. 재생은 Storage 다운로드 URL (mp3 `streamUrl` 우선, 없으면 원본)
- **업로드 변환**: ffmpeg.wasm (브라우저, unpkg CDN 싱글스레드 코어) — WAV/FLAC → 192k mp3 동시 생성, 실패 시 원본만으로 폴백
- **Fonts**: Pretendard Variable (local woff2)
- **Package Manager**: pnpm (`.npmrc`: node-linker=hoisted)
- **호스팅**: Vercel (`music-v1-0` 프로젝트, GitHub `hersouls/Music_v1.0` main = production)

## Commands
```bash
pnpm dev        # 개발 서버 (Turbopack)
pnpm build      # 프로덕션 빌드
pnpm lint       # ESLint
pnpm typecheck  # tsc --noEmit
```

## Architecture
- `src/app/` — `/` 홈(dash-hero + 빠른 재생 + 전체 트랙 + 최근 재생·인사이트), `/library` 보관함(**앨범 그룹**·검색·정렬·StatCard·**곡 등록 위자드**·새 앨범·공개 토글), `/browse` **둘러보기**(모두의 공개 곡, 업로더별 그룹), `/favorites` 즐겨찾기, `/stats` 청취 통계
  - `api/lyrics/align/route.ts` — AI 자동 싱크(POST {lyrics, audioUrl, duration}): Firebase ID 토큰 검증(`lib/server-auth.ts`, 401) → Storage URL 화이트리스트(SSRF 가드) → mp3/WAV 수신(WAV 는 `audio-resample.ts` 로 16kHz 모노 축소) → OpenAI Whisper 전사 → `align.ts` 비례 정렬 → `{lines}`. 키는 `OPENAI_API_KEY`(서버 전용), 미설정 503
  - `api/artwork/generate/route.ts` — **AI 커버 생성**(POST {title, album?, lyrics?}): ID 토큰 검증 → Cartoonify 스타일 프롬프트(텍스트 금지) → OpenAI 이미지(gpt-image-1, 미지원 계정은 dall-e-3 폴백) → base64 반환. Storage 업로드·문서 갱신은 클라(`saveTrackCover`)가 수행
- `src/lib/firebase.ts` — Health 패턴 부트스트랩 (lazy Auth/Firestore/Storage, `isFirebaseConfigured` 폴백, 연결 복구)
- `src/lib/firestore-tracks.ts` — 트랙 데이터 레이어: `subscribeMyTracks`/`subscribePublicTracks`(onSnapshot), 이동·앨범 이름변경/삭제(=싱글로 이동, **album 문자열 필드 batch 갱신 — 문서 id 불변이라 청취 데이터·재생 중 곡 유지**), `setTracksAlbum`(곡 골라 새 앨범 담기), 곡 삭제(문서+Storage 원본·스트림·커버), 가사 저장/삭제(LRC 자동 감지), 공개 토글, `saveTrackCover`(커버 Storage 업로드+문서 갱신)
- `src/lib/ai-client.ts` — AI 라우트 클라 헬퍼(`requestLyricsAlign`/`requestCoverArt`, ID 토큰 자동 첨부)
- `src/lib/upload.ts` — 클라 업로드: WAV RIFF 헤더 파싱(duration·sampleRate, 파일 전체 안 읽음)/비 WAV 는 `<audio>` 길이 측정 → ffmpeg.wasm mp3 변환(무손실만) → Storage `tracks/{uid}/{trackId}/original.<ext>`(+`stream.mp3`) → Firestore 문서. 진행률 콜백(분석/변환/업로드)
- `src/lib/listening-sync.ts` — 청취 데이터 ↔ Firestore 단일 문서 동기화 (에코 억제 + 1.5s 디바운스, 다기기 실시간)
- `src/lib/player-engine.ts` — Audio 엘리먼트 + AudioContext/Analyser 싱글톤. **스토어를 import 하지 않음**(순환 방지) — 이벤트는 `listeners` 주입
- `src/stores/usePlayerStore.ts` — 재생 상태 + 청취 데이터. `skipHydration: true` — AudioEngine 마운트 시 수동 rehydrate. 재생 중 곡이 삭제되면 자동 정지
- `src/contexts/AuthContext.tsx` — Google 로그인(웹 전용) + `users/{uid}` 프로필 문서 갱신
- `src/contexts/TracksContext.tsx` — 내 곡·공개 곡 구독 제공(`useTracks`/`usePublicTracks`/`useAlbums`/`useTracksLoading`) + 스토어에 합집합 시드(공개 곡 재생용)
- `src/components/app/` — AppShell(**AuthProvider→로그인 게이트→TracksProvider→셸**, 사이드바·모바일 드로어·⌘K·계정 메뉴), LoginScreen(np-hero 게이트+미설정 안내), CommandPalette, **TrackWizard**(기본 "곡 등록" 플로우 — 5단계: 업로드(백그라운드 병렬)→가사(LRC 감지)→AI 싱크(자동)→Cartoonify 커버(자동 생성·재생성)→앨범 맵핑+공개. 완료 시점 일괄 반영, 진행 중엔 비공개·싱글), UploadTracksModal(여러 곡 일괄 — 위자드에서 전환), CreateAlbumModal(보관함 곡 골라 담기+커버 모자이크), AlbumNameModal(이름변경), MoveTrackModal(이동+**곡 삭제**)
- `src/components/player/` — AudioEngine(배선·MediaSession·단축키), PlayerBar, NowPlaying(np-hero+바이닐+Visualizer+가사 토글), LyricsPanel(track.lyrics 필드 기반 — LRC 하이라이트·시킹, **소유자만 편집**), LyricsSyncEditor(탭-싱크: AI 초안 또는 직접 찍기→±0.2s 조정→LRC 저장)
- `src/lib/lrc.ts` — LRC 파서/직렬화. `src/components/music/` — TrackArtwork(**coverUrl 이미지 우선**, 없거나 로드 실패 시 id 해시 결정적 SVG), TrackRow(재생·즐겨찾기·이동·공개 토글), EqBars
- `src/components/ui/`, `src/components/charts/`, `src/styles/` — **Health v1.0 에서 verbatim 복사** (수정 금지에 준함 — 디자인 변경은 Health 와 동기화)
- `firestore.rules`·`storage.rules` — 공개 곡 읽기/소유자 쓰기, per-user 격리, 음원 1GB·오디오 타입 제한. 배포: `firebase deploy --only firestore:rules,storage`

## Data Model (Firestore)
```
tracks/{id}: ownerUid, ownerName, title, artist, fileName, album(""=싱글),
  visibility("public"|"private"), originalUrl, streamUrl?, storagePath, streamPath?,
  coverUrl?, coverPath?(AI 커버 — tracks/{uid}/{id}/cover.png),
  duration, sizeBytes, sampleRate/channels/bitsPerSample(WAV), lyrics?, lyricsFormat?,
  createdAt, updatedAt
users/{uid}: displayName, photoURL, email
users/{uid}/data/listening: favorites[], playCounts{}, recentPlays[]
```
- 쿼리는 단일 where(ownerUid / visibility)만 사용 — **복합 인덱스 불필요** (정렬은 클라이언트)
- 앨범은 별도 엔티티 없음 — 곡 등록/이동에서 새 이름 입력으로 생성, 빈 앨범 개념 없음

## Conventions (Health 와 동일)
- 디자인 토큰 `bora-*`/`surface-*`, `cn()` 병합, Light 전용
- 페이지 패턴: PageHeader → StatCard 그리드 → SectionCard/EmptyState → 목록
- 키보드: Space 재생/일시정지, ←/→ ±5s, Shift+←/→ 곡 이동, ↑/↓ 볼륨, M 음소거, F 즐겨찾기, ⌘K 검색
- 트랙 id = Firestore 문서 id (불변). 가사도 트랙 문서 필드 — 이동·이름변경에 끊길 매핑이 없음

## Setup
1. `.env.local` 에 `NEXT_PUBLIC_FIREBASE_*` 6종 (+선택 `OPENAI_API_KEY`) — `.env.example` 참고
2. `pnpm install && pnpm dev` → http://localhost:3000 → Google 로그인
- Vercel 배포: main 푸시 (env 는 Vercel 프로젝트에 등록됨, 도메인 music.moonwave.kr)
- ⚠️ AI 자동 싱크는 음원이 OpenAI 로 업로드됨. 키 없으면 "직접 찍기"만으로 완전 동작
