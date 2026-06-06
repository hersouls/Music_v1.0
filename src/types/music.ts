/* ═══════════════════════════════════════════
   Moonwave Music — Domain Types (단일 진실 공급원)
   v2: Firestore `tracks/{id}` 문서 + Storage 음원
   ═══════════════════════════════════════════ */

export type Visibility = "public" | "private";

/** Firestore `tracks` 문서 + 계산 필드(id·src) — UI 가 쓰는 필드명은 v1 과 동일 유지 */
export interface Track {
  /** Firestore 문서 id — 이동·이름변경에도 불변 (청취 데이터 키) */
  id: string;
  /** 업로더 uid (소유자만 수정/삭제 가능) */
  ownerUid: string;
  /** 업로더 표시명 (둘러보기 표기·artist 기본값) */
  ownerName: string;
  /** 파일명에서 확장자를 뗀 곡 제목 */
  title: string;
  artist: string;
  /** 원본 파일명 (검색·표시용) */
  fileName: string;
  /** 앨범명 — "" = 싱글 (문자열 그룹, 폴더 개념 없음) */
  album: string;
  visibility: Visibility;
  /** 재생 URL — 변환 mp3(streamUrl) 우선, 없으면 원본 */
  src: string;
  /** 원본 다운로드 URL (Storage) */
  originalUrl: string;
  /** 스트리밍용 mp3 URL (변환 성공 시) */
  streamUrl: string | null;
  /** Storage 경로: tracks/{ownerUid}/{trackId}/original.<ext> */
  storagePath: string;
  /** Storage 경로: tracks/{ownerUid}/{trackId}/stream.mp3 (있으면) */
  streamPath: string | null;
  /** 재생 길이(초) — 업로드 시 클라이언트가 측정, 알 수 없으면 0 */
  duration: number;
  sizeBytes: number;
  /** WAV 포맷 정보 (비 WAV 파일은 0) */
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  /** 가사 (LRC/일반 텍스트) — 문서 필드로 보관 */
  lyrics: string | null;
  lyricsFormat: "lrc" | "txt" | null;
  /** AI 생성 커버 이미지 URL (없으면 결정적 SVG 아트 폴백) */
  coverUrl: string | null;
  /** Storage 경로: tracks/{ownerUid}/{trackId}/cover.png */
  coverPath: string | null;
  /** epoch ms (serverTimestamp → millis) */
  createdAt: number;
  updatedAt: number;
}

export type RepeatMode = "off" | "all" | "one";

/** 재생 이력 1건 (Firestore users/{uid}/data/listening 동기화) */
export interface PlayEvent {
  id: string;
  /** ISO datetime */
  at: string;
}
