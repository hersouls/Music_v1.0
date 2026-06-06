/* ═══════════════════════════════════════════
   Moonwave Music v1.0 — Domain Types (단일 진실 공급원)
   ═══════════════════════════════════════════ */

/** .Music 폴더에서 스캔한 오디오 트랙 (서버에서 WAV 헤더 파싱) */
export interface Track {
  /** 상대경로 해시 기반 안정 ID (스트리밍 URL 키) — 루트 파일은 기존 파일명 해시와 동일 */
  id: string;
  /** 파일명에서 확장자를 뗀 곡 제목 */
  title: string;
  artist: string;
  /** 파일명 (경로 제외) */
  fileName: string;
  /** .Music 기준 상대경로 (앨범 폴더 포함) — 스트리밍 해석용 */
  relPath: string;
  /** 앨범명 = 상위 폴더명 (루트 파일은 "" → UI에서 "싱글" 그룹) */
  album: string;
  /** 스트리밍 URL (/api/stream/[id]) */
  src: string;
  /** 재생 길이(초) — WAV 헤더 기반, 알 수 없으면 0 */
  duration: number;
  sizeBytes: number;
  /** WAV 포맷 정보 (비 WAV 파일은 0) */
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
}

export type RepeatMode = "off" | "all" | "one";

/** 재생 이력 1건 (localStorage 영속) */
export interface PlayEvent {
  id: string;
  /** ISO datetime */
  at: string;
}
