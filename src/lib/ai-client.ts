import { getFirebaseAuth } from "@/lib/firebase";

/* ───────────────────────────────────────────
   AI 서버 라우트 클라이언트 헬퍼 (가사 싱크 · 커버 생성)
   — Firebase ID 토큰을 Authorization 헤더로 전달
   ─────────────────────────────────────────── */

async function authHeaders(): Promise<Record<string, string>> {
  const idToken = await getFirebaseAuth().currentUser?.getIdToken();
  if (!idToken) throw new Error("로그인이 필요합니다");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${idToken}`,
  };
}

export interface AlignedLine {
  text: string;
  time: number | null;
}

/** AI 자동 가사 싱크 — Whisper 전사 후 줄별 타임스탬프 초안 */
export async function requestLyricsAlign(params: {
  lyrics: string;
  /** 스트리밍 mp3 우선 (작음·25MB 한도 안전), 없으면 원본 */
  audioUrl: string;
  duration: number;
}): Promise<AlignedLine[]> {
  const res = await fetch("/api/lyrics/align", {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify(params),
  });
  const data = (await res.json()) as { lines?: AlignedLine[]; error?: string };
  if (!res.ok || !data.lines?.length) {
    throw new Error(data.error || "AI 싱크에 실패했습니다");
  }
  return data.lines;
}

/** AI 커버 생성 — 스타일 선택(cartoon·watercolor·neon…). base64 → Blob */
export async function requestCoverArt(params: {
  title: string;
  album?: string;
  lyrics?: string;
  /** cover-styles.ts 의 스타일 id (없으면 서버 기본 = cartoon) */
  style?: string;
}): Promise<Blob> {
  const res = await fetch("/api/artwork/generate", {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify(params),
  });
  const data = (await res.json()) as { b64?: string; mime?: string; error?: string };
  if (!res.ok || !data.b64) {
    throw new Error(data.error || "커버 생성에 실패했습니다");
  }
  const bytes = Uint8Array.from(atob(data.b64), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: data.mime || "image/png" });
}
