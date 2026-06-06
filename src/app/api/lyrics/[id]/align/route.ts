import path from "node:path";
import { MUSIC_DIR, getTracks } from "@/lib/tracks.server";
import { wavToWhisperMono16k } from "@/lib/audio-resample";
import { alignLyrics, type WhisperSegment } from "@/lib/align";
import { splitLyricLines } from "@/lib/lrc";

/* ───────────────────────────────────────────
   AI 자동 가사 싱크 — POST { lyrics }
   ① WAV → 16kHz 모노로 축소 ② OpenAI Whisper 전사(verbose_json,
   세그먼트 타임스탬프) ③ 붙여넣은 가사 줄에 비례 정렬 →
   { lines: [{text,time}] } 반환(저장은 클라이언트가 검토 후).
   키는 서버 환경변수 OPENAI_API_KEY 만 사용(브라우저 노출 금지).
   ─────────────────────────────────────────── */

export const runtime = "nodejs";
export const maxDuration = 120;

const OPENAI_URL = "https://api.openai.com/v1/audio/transcriptions";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;

  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return Response.json(
      {
        error:
          "OpenAI API 키가 없습니다 — .env.local 에 OPENAI_API_KEY 를 넣고 개발 서버를 재시작하세요",
      },
      { status: 503 }
    );
  }

  let body: { lyrics?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "잘못된 요청입니다" }, { status: 400 });
  }
  const lyrics = typeof body.lyrics === "string" ? body.lyrics : "";
  const lines = splitLyricLines(lyrics);
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  if (!lines.length) {
    return Response.json({ error: "가사를 먼저 입력하세요" }, { status: 400 });
  }

  const tracks = await getTracks();
  const track = tracks.find((t) => t.id === id);
  if (!track) {
    return Response.json({ error: "트랙을 찾을 수 없습니다" }, { status: 404 });
  }

  let wav: Buffer;
  try {
    wav = await wavToWhisperMono16k(path.join(MUSIC_DIR, track.relPath));
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "오디오 변환에 실패했습니다" },
      { status: 415 }
    );
  }

  // OpenAI Whisper 전사 (plain fetch — SDK 불필요)
  let data: { segments?: WhisperSegment[]; error?: { message?: string } };
  try {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(wav)], { type: "audio/wav" }), "audio.wav");
    form.append("model", "whisper-1");
    form.append("response_format", "verbose_json");
    form.append("language", "ko");
    // 실제 가사를 힌트로 줘 인식 정확도 향상 (Whisper prompt 길이 제한 고려해 일부만)
    form.append("prompt", lyrics.slice(0, 600));

    const res = await fetch(OPENAI_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
    data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error?.message || `OpenAI 오류 (${res.status})`);
    }
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "AI 전사에 실패했습니다" },
      { status: 502 }
    );
  }

  const segments = (data.segments ?? []).map((s) => ({
    start: s.start,
    end: s.end,
    text: s.text ?? "",
  }));
  if (!segments.length) {
    return Response.json(
      { error: "음성을 인식하지 못했습니다 (보컬이 약하거나 연주곡일 수 있어요)" },
      { status: 502 }
    );
  }

  const aligned = alignLyrics(lines, segments, track.duration);
  return Response.json({ ok: true, lines: aligned });
}
