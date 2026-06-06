# Moonwave Music v1.0

## Project Overview
로컬 음악 보관함 프론트엔드 (music.moonwave.kr) — 프로젝트 루트 `.Music/` 폴더의 WAV 원음을 스캔·스트리밍 재생. **Health v1.0 의 Foundation Design System UI/UX 를 100% 계승** (BORA parity, light-only).

## Tech Stack
- **Framework**: Next.js 16 (App Router) + React 19 + TypeScript 5.9
- **Styling**: Tailwind CSS v4 (CSS-first) + Foundation Design System (Health/BORA 에서 그대로 복사) + Framer Motion
- **UI**: Headless UI, lucide-react, 의존성 0 SVG 차트 (RingProgress/BarChart/Sparkline)
- **상태**: zustand (player/toast/dialog) — 청취 데이터(즐겨찾기·재생수·최근재생·볼륨 등)는 `persist` 로 localStorage 영속
- **오디오**: HTMLAudioElement 싱글톤 + Web Audio AnalyserNode(비주얼라이저) + Media Session API
- **Fonts**: Pretendard Variable (local woff2)
- **Package Manager**: pnpm (`.npmrc`: node-linker=hoisted)
- **백엔드/인증 없음** — Firebase·API 키 일절 불사용, 전부 로컬

## Commands
```bash
pnpm dev        # 개발 서버 (Turbopack)
pnpm build      # 프로덕션 빌드
pnpm lint       # ESLint
pnpm typecheck  # tsc --noEmit
```

## Architecture
- `src/app/` — `/` 홈(dash-hero + 빠른 재생 + 전체 트랙 + 최근 재생·인사이트), `/library` 보관함(**앨범 그룹**·검색·정렬·StatCard·**곡 등록**), `/favorites` 즐겨찾기, `/stats` 청취 통계(차트·기록 초기화)
  - `api/stream/[id]/route.ts` — `.Music` 원본을 **Range 지원**으로 스트리밍 (시킹 필수, public 복사 없음)
  - `api/upload/route.ts` — 곡 등록(파일 1개씩 multipart, 선택 `album` 필드 → `.Music/<앨범>/` 저장). 파일명·앨범명 정제(경로 탈출·금지문자 차단)+확장자 허용목록+WAV 매직바이트 검증, 중복 파일명은 " (2)" 접미사로 원본 보존
  - layout 은 `force-dynamic` — 요청 시 `.Music` 재스캔
- `src/lib/tracks.server.ts` — `.Music` 스캐너(**1단계 깊이: 하위 폴더 = 앨범**, 루트 파일 = 싱글). **WAV RIFF 헤더만 직접 파싱**해 duration·sampleRate 추출(파일 전체 안 읽음), 상대경로 md5 12자리가 트랙 id(루트 파일은 기존 파일명 해시와 동일 — 청취 데이터 보존), 모듈 캐시(relPath+size+mtime 키)
- `src/lib/player-engine.ts` — Audio 엘리먼트 + AudioContext/Analyser 싱글톤. **스토어를 import 하지 않음**(순환 방지) — 이벤트는 `listeners` 주입
- `src/stores/usePlayerStore.ts` — 재생 상태 + 청취 데이터. `skipHydration: true` — AudioEngine 마운트 시 수동 rehydrate(SSR 불일치 방지)
- `src/components/player/` — AudioEngine(배선·MediaSession·단축키), PlayerBar(하단 고정), NowPlaying(풀스크린 np-hero + 회전 바이닐 + Visualizer), RangeSlider, Visualizer(캔버스 rAF)
- `src/components/music/` — TrackArtwork(파일명 해시 결정적 SVG 아트, 3 variant), TrackRow, EqBars
- `src/components/app/` — AppShell(Health 셸 패리티 — 사이드바·모바일 드로어·⌘K), CommandPalette(트랙 검색→재생, 곡 등록 액션), UploadTracksModal(드래그&드롭 다중 업로드 + **앨범 선택/새 앨범 생성** → 완료 시 `router.refresh()` 재스캔; `/library?add=1` 딥링크로 자동 오픈)
- `src/components/ui/`, `src/components/charts/`, `src/styles/` — **Health v1.0 에서 verbatim 복사** (수정 금지에 준함 — 디자인 변경은 Health 와 동기화)
- `src/contexts/TracksContext.tsx` — 서버 스캔 트랙을 동기 제공(깜빡임 없음) + 스토어 시드

## Conventions (Health 와 동일)
- 디자인 토큰 `bora-*`/`surface-*`, `cn()` 병합, Light 전용
- 페이지 패턴: PageHeader → StatCard 그리드 → SectionCard/EmptyState → 목록
- 키보드: Space 재생/일시정지, ←/→ ±5s, Shift+←/→ 곡 이동, ↑/↓ 볼륨, M 음소거, F 즐겨찾기, ⌘K 검색
- ⚠️ 트랙 id 는 상대경로 기반 — `.Music` 파일명 변경·폴더 이동 시 즐겨찾기/재생수 매핑이 끊어짐(의도된 단순화)
- 앨범 = `.Music` 하위 폴더(1단계). 루트 파일은 보관함에서 "싱글" 그룹으로 묶임

## Setup
1. `.Music/` 폴더에 WAV(mp3/m4a/ogg/flac 도 가능) 파일 배치
2. `pnpm install && pnpm dev` → http://localhost:3000
