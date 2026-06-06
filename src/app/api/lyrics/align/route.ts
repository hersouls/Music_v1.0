import { isWavBuffer, wavBufferToWhisperMono16k } from "@/lib/audio-resample";
import { alignLyrics, type WhisperSegment } from "@/lib/align";
import { splitLyricLines } from "@/lib/lrc";

/* ───────────────────────────────────────────
   AI 자동 가사 싱크 — POST { lyrics, audioUrl, duration }
   ① Firebase Storage 의 음원을 서버에서 가져옴
      (스트리밍 mp3 우선 — 작아서 Whisper 25MB 한도 안전)
   ② WAV 면 16kHz 모노로 축소 ③ OpenAI Whisper 전사(verbose_json)
   ④ 붙여넣은 가사 줄에 비례 정렬 → { lines: [{text,time}] } 반환
   키는 서버 환경변수 OPENAI_API_KEY 만 사용(브라우저 노출 금지).
   ─────────────────────────────────────────── */

export const runtime = "nodejs";
export const maxDuration = 120;

const OPENAI_URL = "https://api.openai.com/v1/audio/transcriptions";
/** Whisper 업로드 한도(25MB)의 안전 마진 */
const MAX_COMPRESSED_BYTES = 24 * 1024 * 1024;
/** WAV 원본 수신 상한 (리샘플 전) */
const MAX_WAV_BYTES = 150 * 1024 * 1024;

/** SSRF 가드 — 우리 Firebase Storage 버킷의 다운로드 URL 만 허용 */
function isAllowedAudioUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.hostname !== "firebasestorage.googleapis.com") return false;
  const bucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!bucket) return false;
  return url.pathname.startsWith(`/v0/b/${bucket}/o/`);
}

/** 로그인 사용자만 허용 — Firebase ID 토큰을 Identity Toolkit 으로 검증
    (admin SDK 불필요 — accounts:lookup 은 웹 API 키로 호출 가능) */
async function verifyIdToken(req: Request): Promise<boolean> {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) return false;
  const idToken = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!idToken) return false;
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      }
    );
    if (!res.ok) return false;
    const data = (await res.json()) as { users?: unknown[] };
    return Array.isArray(data.users) && data.users.length > 0;
  } catch {
    return false;
  }
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

  if (!(await verifyIdToken(req))) {
    return Response.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  let body: { lyrics?: unknown; audioUrl?: unknown; duration?: unknown };
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

  const audioUrl = typeof body.audioUrl === "string" ? body.audioUrl : "";
  if (!isAllowedAudioUrl(audioUrl)) {
    return Response.json({ error: "허용되지 않은 음원 주소입니다" }, { status: 400 });
  }
  const duration =
    typeof body.duration === "number" && Number.isFinite(body.duration)
      ? Math.max(0, body.duration)
      : 0;

  /* ① 음원 가져오기 (Storage 공개 읽기) */
  let audio: Buffer;
  let isWav: boolean;
  try {
    const res = await fetch(audioUrl);
    if (!res.ok) throw new Error(`음원을 가져오지 못했습니다 (${res.status})`);
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > MAX_WAV_BYTES) throw new Error("음원이 너무 큽니다");
    audio = Buffer.from(await res.arrayBuffer());
    if (audio.length > MAX_WAV_BYTES) throw new Error("음원이 너무 큽니다");
    isWav = isWavBuffer(audio);
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "음원을 가져오지 못했습니다" },
      { status: 502 }
    );
  }

  /* ② Whisper 입력 준비 — WAV 는 16kHz 모노 축소, 압축 포맷은 그대로 */
  let payload: Blob;
  let payloadName: string;
  if (isWav) {
    try {
      const small = wavBufferToWhisperMono16k(audio);
      payload = new Blob([new Uint8Array(small)], { type: "audio/wav" });
      payloadName = "audio.wav";
    } catch (e) {
      return Response.json(
        { error: e instanceof Error ? e.message : "오디오 변환에 실패했습니다" },
        { status: 415 }
      );
    }
  } else {
    if (audio.length > MAX_COMPRESSED_BYTES) {
      return Response.json(
        { error: "음원이 너무 큽니다 (25MB 한도) — WAV 원본으로 다시 시도하세요" },
        { status: 413 }
      );
    }
    payload = new Blob([new Uint8Array(audio)], { type: "audio/mpeg" });
    payloadName = "audio.mp3";
  }

  /* ③ OpenAI Whisper 전사 (plain fetch — SDK 불필요) */
  let data: { segments?: WhisperSegment[]; error?: { message?: string } };
  try {
    const form = new FormData();
    form.append("file", payload, payloadName);
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

  /* ④ 가사 줄 정렬 */
  const aligned = alignLyrics(lines, segments, duration);
  return Response.json({ ok: true, lines: aligned });
}
