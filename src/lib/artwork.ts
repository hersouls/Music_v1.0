/* ───────────────────────────────────────────
   트랙 아트워크 — 파일명 해시 기반 결정적 그라데이션
   (WAV 에는 앨범아트가 없으므로 트랙마다 고유한
    비주얼을 생성 — 의존성 0, 서버/클라이언트 동일 결과)
   ─────────────────────────────────────────── */

export interface ArtworkSpec {
  from: string;
  to: string;
  accent: string;
  angle: number;
  /** 0: 바이닐 링, 1: 웨이브, 2: 오브(원형 글로우) */
  variant: 0 | 1 | 2;
  /** 웨이브 위상 등 변형 시드 */
  seed: number;
}

/** 큐레이션된 그라데이션 팔레트 [from, to, accent] */
const PALETTES: Array<[string, string, string]> = [
  ["#7c3aed", "#6366f1", "#c4b5fd"], // 보라 → 인디고
  ["#6366f1", "#0ea5e9", "#bae6fd"], // 인디고 → 스카이
  ["#0d9488", "#34d399", "#a7f3d0"], // 틸 → 에메랄드
  ["#f43f5e", "#fb923c", "#fecdd3"], // 로즈 → 오렌지
  ["#d97706", "#ef4444", "#fde68a"], // 앰버 → 레드
  ["#8b5cf6", "#ec4899", "#f5d0fe"], // 바이올렛 → 핑크
  ["#0284c7", "#22d3ee", "#cffafe"], // 스카이 → 시안
  ["#1e3a8a", "#7c3aed", "#ddd6fe"], // 네이비 → 보라
];

/** djb2 변형 — 결정적 문자열 해시 */
export function hashId(id: string): number {
  let h = 5381;
  for (const ch of id) h = ((h * 33) ^ ch.codePointAt(0)!) >>> 0;
  return h;
}

export function artworkSpec(id: string): ArtworkSpec {
  const h = hashId(id);
  const [from, to, accent] = PALETTES[h % PALETTES.length];
  return {
    from,
    to,
    accent,
    angle: (h >> 3) % 360,
    variant: ((h >> 7) % 3) as 0 | 1 | 2,
    seed: (h >> 11) % 1000,
  };
}

/* ── Media Session 용 PNG 아트워크 (클라이언트 전용, 캔버스) ── */

const dataUrlCache = new Map<string, string>();

export function artworkDataUrl(id: string, size = 512): string {
  const key = `${id}:${size}`;
  const cached = dataUrlCache.get(key);
  if (cached) return cached;
  if (typeof document === "undefined") return "";

  const spec = artworkSpec(id);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  // 그라데이션 배경 (angle 방향)
  const rad = (spec.angle * Math.PI) / 180;
  const cx = size / 2;
  const r = size / 2;
  const grad = ctx.createLinearGradient(
    cx - Math.cos(rad) * r,
    cx - Math.sin(rad) * r,
    cx + Math.cos(rad) * r,
    cx + Math.sin(rad) * r
  );
  grad.addColorStop(0, spec.from);
  grad.addColorStop(1, spec.to);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // 우상단 글로우
  const glow = ctx.createRadialGradient(size * 0.85, size * 0.15, 0, size * 0.85, size * 0.15, size * 0.7);
  glow.addColorStop(0, "rgba(255,255,255,0.25)");
  glow.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);

  // 바이닐 링
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  for (let i = 1; i <= 5; i++) {
    ctx.lineWidth = size * 0.008;
    ctx.beginPath();
    ctx.arc(cx, cx, (size * 0.08) * i + size * 0.04, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.beginPath();
  ctx.arc(cx, cx, size * 0.035, 0, Math.PI * 2);
  ctx.fill();

  const url = canvas.toDataURL("image/png");
  dataUrlCache.set(key, url);
  return url;
}
