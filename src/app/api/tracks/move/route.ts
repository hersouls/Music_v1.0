import { promises as fs } from "node:fs";
import path from "node:path";
import { MUSIC_DIR, getTracks, trackId } from "@/lib/tracks.server";
import {
  sanitizeAlbumName,
  uniqueFileName,
  isInside,
  moveLyricsSidecars,
} from "@/lib/music-fs";

/* ───────────────────────────────────────────
   곡 이동 — POST { id, album } ("" = 싱글/루트)
   파일을 .Music/<앨범>/ 으로 옮기고, 새 트랙 id 와의
   리맵 쌍을 반환한다 (클라이언트 청취 데이터 보존용).
   대상 앨범 폴더가 없으면 즉석 생성.
   ─────────────────────────────────────────── */

export async function POST(req: Request) {
  let body: { id?: unknown; album?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "잘못된 요청입니다" }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id : "";
  const albumRaw = typeof body.album === "string" ? body.album.trim() : "";
  let album = "";
  if (albumRaw) {
    const folder = sanitizeAlbumName(albumRaw);
    if (!folder) {
      return Response.json(
        { error: "사용할 수 없는 앨범 이름입니다" },
        { status: 400 }
      );
    }
    album = folder;
  }

  const tracks = await getTracks();
  const track = tracks.find((t) => t.id === id);
  if (!track) {
    return Response.json({ error: "트랙을 찾을 수 없습니다" }, { status: 404 });
  }
  if (track.album === album) {
    return Response.json({ ok: true, moved: [], album }); // 이미 같은 위치 — no-op
  }

  const destDir = album ? path.join(MUSIC_DIR, album) : MUSIC_DIR;
  if (!isInside(MUSIC_DIR, path.join(destDir, "_"))) {
    return Response.json({ error: "잘못된 경로입니다" }, { status: 400 });
  }
  await fs.mkdir(destDir, { recursive: true });

  const finalName = await uniqueFileName(destDir, track.fileName);
  const srcPath = path.join(MUSIC_DIR, track.relPath);
  const destPath = path.join(destDir, finalName);
  try {
    await fs.rename(srcPath, destPath);
  } catch {
    return Response.json(
      { error: "파일을 이동하지 못했습니다 (다른 프로그램에서 사용 중일 수 있어요)" },
      { status: 500 }
    );
  }

  // 가사 사이드카(.lrc/.txt)도 곡을 따라 이동
  const srcDir = path.join(MUSIC_DIR, path.dirname(track.relPath));
  const ext = path.extname(track.fileName);
  await moveLyricsSidecars(
    srcDir,
    path.basename(track.fileName, ext),
    destDir,
    path.basename(finalName, path.extname(finalName))
  );

  const newRelPath = album ? `${album}/${finalName}` : finalName;
  return Response.json({
    ok: true,
    album,
    fileName: finalName,
    moved: [{ oldId: id, newId: trackId(newRelPath) }],
  });
}
