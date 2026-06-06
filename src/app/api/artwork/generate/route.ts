import {
  verifyIdToken,
  checkRateLimit,
  rateLimitResponse,
} from "@/lib/server-auth";

/* ───────────────────────────────────────────
   AI 커버 아트 생성 — POST { title, album?, lyrics? }
   Cartoonify 스타일 앨범 커버를 OpenAI 이미지 모델로 생성해
   base64 로 반환 (Storage 업로드·문서 갱신은 클라이언트가 수행 —
   Firebase 쓰기는 전부 클라 SDK + 보안 규칙 경유 원칙 유지).
   gpt-image-1 우선, 미지원 계정이면 dall-e-3 폴백.
   ─────────────────────────────────────────── */

export const runtime = "nodejs";
export const maxDuration = 120;

const OPENAI_URL = "https://api.openai.com/v1/images/generations";
const MAX_TITLE = 120;
const MAX_LYRICS_HINT = 280;

function buildPrompt(title: string, album: string, lyricsHint: string): string {
  const subject = [
    `Square album cover illustration for the song "${title}"`,
    album ? `from the album "${album}"` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return [
    `${subject}.`,
    "Style: cartoonify — bold clean outlines, flat vibrant colors,",
    "playful hand-drawn cartoon look, soft gradients, high contrast,",
    "centered composition, dreamy wave and moonlight motifs welcome.",
    lyricsHint ? `Mood and imagery inspired by these lyrics: ${lyricsHint}` : "",
    "Strictly no text, no letters, no typography, no watermark, no signature.",
  ]
    .filter(Boolean)
    .join("\n");
}

interface OpenAiImageResponse {
  data?: { b64_json?: string }[];
  error?: { message?: string; code?: string };
}

async function generate(
  key: string,
  model: "gpt-image-1" | "dall-e-3",
  prompt: string
): Promise<{ ok: true; b64: string } | { ok: false; status: number; message: string }> {
  const body: Record<string, unknown> = {
    model,
    prompt,
    n: 1,
    size: "1024x1024",
  };
  if (model === "gpt-image-1") {
    body.quality = "medium"; // 기본 b64 반환
  } else {
    body.quality = "standard";
    body.response_format = "b64_json";
  }
  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as OpenAiImageResponse;
  const b64 = data.data?.[0]?.b64_json;
  if (!res.ok || !b64) {
    return {
      ok: false,
      status: res.status,
      message: data.error?.message || `OpenAI 오류 (${res.status})`,
    };
  }
  return { ok: true, b64 };
}

export async function POST(req: Request) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return Response.json(
      {
        error:
          "OpenAI API 키가 없습니다 — 서버 환경변수 OPENAI_API_KEY 를 설정하세요",
      },
      { status: 503 }
    );
  }

  const uid = await verifyIdToken(req);
  if (!uid) {
    return Response.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  // 비용 가드 — 사용자당 10분에 12장
  const rl = checkRateLimit(`art:${uid}`, 12, 10 * 60 * 1000, Date.now());
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);

  let body: { title?: unknown; album?: unknown; lyrics?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "잘못된 요청입니다" }, { status: 400 });
  }

  const title =
    typeof body.title === "string" ? body.title.trim().slice(0, MAX_TITLE) : "";
  if (!title) {
    return Response.json({ error: "곡 제목이 필요합니다" }, { status: 400 });
  }
  const album =
    typeof body.album === "string" ? body.album.trim().slice(0, MAX_TITLE) : "";
  // 가사에서 타임태그 제거 후 앞부분만 힌트로 (프롬프트 길이 제한)
  const lyricsHint =
    typeof body.lyrics === "string"
      ? body.lyrics
          .replace(/\[[^\]]*\]/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, MAX_LYRICS_HINT)
      : "";

  const prompt = buildPrompt(title, album, lyricsHint);

  try {
    // gpt-image-1 → (조직 미검증 등으로 거부 시) dall-e-3 폴백
    let result = await generate(key, "gpt-image-1", prompt);
    if (!result.ok && (result.status === 400 || result.status === 403 || result.status === 404)) {
      result = await generate(key, "dall-e-3", prompt);
    }
    if (!result.ok) {
      return Response.json({ error: result.message }, { status: 502 });
    }
    return Response.json({ ok: true, b64: result.b64, mime: "image/png" });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "커버 생성에 실패했습니다" },
      { status: 502 }
    );
  }
}
