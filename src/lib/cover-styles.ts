/* ───────────────────────────────────────────
   AI 커버 아트 스타일 (클라·서버 공용 — 순수 데이터)
   각 스타일은 OpenAI 이미지 프롬프트 조각(prompt)을 가진다.
   라우트가 subject + 이 조각 + 가사 힌트 + 공통 제약으로 합성.
   ─────────────────────────────────────────── */

export interface CoverStyle {
  id: string;
  /** UI 표시 라벨 (한글) */
  label: string;
  /** 칩 보조 설명 */
  desc: string;
  /** OpenAI 프롬프트 스타일 조각 (영문) */
  prompt: string;
}

export const COVER_STYLES: CoverStyle[] = [
  {
    id: "cartoon",
    label: "카툰",
    desc: "선명한 만화풍",
    prompt:
      "Cartoonify style: bold clean outlines, flat vibrant colors, playful hand-drawn cartoon look, soft cel shading, high contrast.",
  },
  {
    id: "watercolor",
    label: "수채화",
    desc: "부드러운 번짐",
    prompt:
      "Soft watercolor painting: delicate translucent washes, bleeding pigments, visible paper texture, dreamy pastel tones, gentle gradients.",
  },
  {
    id: "neon",
    label: "네온",
    desc: "사이버펑크 글로우",
    prompt:
      "Neon synthwave cyberpunk: glowing neon lines, dark moody background, vibrant magenta and cyan glow, retro-futuristic 80s aesthetic, light bloom.",
  },
  {
    id: "minimal",
    label: "미니멀",
    desc: "단순·여백",
    prompt:
      "Minimalist design: simple geometric shapes, generous negative space, limited two or three color palette, clean flat modern, elegant.",
  },
  {
    id: "dreamy",
    label: "몽환",
    desc: "달빛·파도",
    prompt:
      "Dreamy ethereal artwork: soft glowing light, surreal atmosphere, gentle bokeh, moonlit ocean waves and starry night sky, calming gradients.",
  },
  {
    id: "anime",
    label: "애니메이션",
    desc: "셀 셰이딩",
    prompt:
      "Anime / manga illustration: clean cel-shaded scenery, expressive, vivid saturated colors, crisp lines, Japanese animation style.",
  },
  {
    id: "oil",
    label: "유화",
    desc: "두꺼운 붓터치",
    prompt:
      "Classical oil painting: thick impasto brushstrokes, richly textured canvas, painterly, warm dramatic lighting, fine-art feel.",
  },
  {
    id: "photo",
    label: "포토",
    desc: "시네마틱 사진",
    prompt:
      "Cinematic photographic look: photorealistic, dramatic lighting, shallow depth of field, rich atmospheric mood, subtle film grain.",
  },
  {
    id: "vaporwave",
    label: "베이퍼웨이브",
    desc: "레트로 파스텔",
    prompt:
      "Vaporwave aesthetic: 80s-90s retro, pastel pink and cyan, roman statues, perspective grids, subtle glitch, nostalgic dreamy mood.",
  },
  {
    id: "pixel",
    label: "픽셀아트",
    desc: "16비트 레트로",
    prompt:
      "16-bit pixel art: crisp pixelated shapes, limited retro game palette, subtle dithering, nostalgic chiptune-era game cover.",
  },
  {
    id: "abstract",
    label: "추상",
    desc: "유체 그라데이션",
    prompt:
      "Abstract fluid art: flowing organic gradient shapes, smooth liquid color blends, modern elegant, dynamic sense of motion.",
  },
  {
    id: "lineart",
    label: "라인아트",
    desc: "한 줄 드로잉",
    prompt:
      "Minimal continuous line art: elegant single-weight line drawing on a soft solid background, refined, modern, lots of negative space.",
  },
];

export const DEFAULT_COVER_STYLE = "cartoon";

const BY_ID = new Map(COVER_STYLES.map((s) => [s.id, s]));

export function isCoverStyle(id: unknown): id is string {
  return typeof id === "string" && BY_ID.has(id);
}

/** 스타일 프롬프트 조각 (없으면 기본 카툰) */
export function coverStylePrompt(id: unknown): string {
  const s = (typeof id === "string" && BY_ID.get(id)) || BY_ID.get(DEFAULT_COVER_STYLE)!;
  return s.prompt;
}

/** 공통 제약 — 정사각·텍스트 금지 등 */
export const COVER_BASE_PROMPT =
  "Square 1:1 album cover. Centered, balanced composition. Cohesive color palette. Strictly no text, no letters, no numbers, no typography, no watermark, no signature, no logo.";
