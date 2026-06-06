/* ───────────────────────────────────────────
   음악 전용 포맷 유틸 (시간 · 용량 · 상대시각)
   ─────────────────────────────────────────── */

/** 초 → "3:42" / "1:02:09" */
export function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const total = Math.floor(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** 초 → "34분" / "1시간 12분" / "48초" */
export function formatDurationKo(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return "0분";
  const total = Math.round(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h > 0) return m > 0 ? `${h}시간 ${m}분` : `${h}시간`;
  if (m > 0) return `${m}분`;
  return `${total}초`;
}

/** 바이트 → "41.5 MB" */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 100 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

/** ISO datetime → "방금 전" / "5분 전" / "3시간 전" / "어제" / "6월 2일" */
export function relativeTimeKo(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "-";
  const diffSec = Math.max(0, (Date.now() - then) / 1000);
  if (diffSec < 60) return "방금 전";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}분 전`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}시간 전`;
  if (diffSec < 172800) return "어제";
  const d = new Date(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

/** 샘플레이트 → "44.1kHz" */
export function formatSampleRate(hz: number): string {
  if (!hz) return "—";
  const k = hz / 1000;
  return `${Number.isInteger(k) ? k : k.toFixed(1)}kHz`;
}
