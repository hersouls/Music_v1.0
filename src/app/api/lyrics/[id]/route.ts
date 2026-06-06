import { promises as fs } from "node:fs";
import path from "node:path";
import { MUSIC_DIR, getTracks } from "@/lib/tracks.server";
import { looksLikeLrc } from "@/lib/lrc";
import { isInside } from "@/lib/music-fs";

/* ───────────────────────────────────────────
   가사 사이드카 — 오디오 파일 옆 <같은 이름>.lrc/.txt
   GET    가사 조회 ({ format, content } | 404)
   PUT    { content } 저장 — LRC 자동 감지(타임태그 2줄↑),
          반대 확장자 사이드카는 제거(중복 방지)
   DELETE 사이드카 삭제
   WAV 원본은 절대 수정하지 않음.
   ─────────────────────────────────────────── */

const MAX_LYRICS_BYTES = 200 * 1024;

async function sidecarPaths(id: string) {
  const tracks = await getTracks();
  const track = tracks.find((t) => t.id === id);
  if (!track) return null;
  const dir = path.join(MUSIC_DIR, path.dirname(track.relPath));
  const stem = path.basename(track.fileName, path.extname(track.fileName));
  const lrc = path.join(dir, `${stem}.lrc`);
  const txt = path.join(dir, `${stem}.txt`);
  if (!isInside(MUSIC_DIR, lrc) || !isInside(MUSIC_DIR, txt)) return null;
  return { lrc, txt, track };
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const paths = await sidecarPaths(id);
  if (!paths) return Response.json({ error: "트랙을 찾을 수 없습니다" }, { status: 404 });

  for (const [format, filePath] of [
    ["lrc", paths.lrc],
    ["txt", paths.txt],
  ] as const) {
    try {
      const content = await fs.readFile(filePath, "utf8");
      return Response.json({ format, content });
    } catch {
      // 다음 후보
    }
  }
  return Response.json({ error: "가사가 없습니다" }, { status: 404 });
}

export async function PUT(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const paths = await sidecarPaths(id);
  if (!paths) return Response.json({ error: "트랙을 찾을 수 없습니다" }, { status: 404 });

  let body: { content?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "잘못된 요청입니다" }, { status: 400 });
  }
  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!content) {
    return Response.json({ error: "가사 내용이 비어 있습니다" }, { status: 400 });
  }
  if (Buffer.byteLength(content, "utf8") > MAX_LYRICS_BYTES) {
    return Response.json({ error: "가사가 너무 깁니다 (최대 200KB)" }, { status: 413 });
  }

  const isLrc = looksLikeLrc(content);
  const target = isLrc ? paths.lrc : paths.txt;
  const other = isLrc ? paths.txt : paths.lrc;
  await fs.writeFile(target, content, "utf8");
  await fs.rm(other, { force: true }); // 반대 포맷 잔재 제거
  return Response.json({ ok: true, format: isLrc ? "lrc" : "txt" });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const paths = await sidecarPaths(id);
  if (!paths) return Response.json({ error: "트랙을 찾을 수 없습니다" }, { status: 404 });
  await fs.rm(paths.lrc, { force: true });
  await fs.rm(paths.txt, { force: true });
  return Response.json({ ok: true });
}
