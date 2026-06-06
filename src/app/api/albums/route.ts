import { promises as fs } from "node:fs";
import path from "node:path";
import { MUSIC_DIR, AUDIO_EXTS, trackId } from "@/lib/tracks.server";
import { sanitizeAlbumName, uniqueFileName, isInside } from "@/lib/music-fs";

/* ───────────────────────────────────────────
   앨범 관리 — 폴더 = 앨범
   POST   { name }       빈 앨범(폴더) 생성
   PATCH  { from, to }   앨범 이름 변경 → 안의 곡 id 리맵 쌍 반환
   DELETE ?name=         앨범 삭제 — 오디오는 싱글(루트)로 안전 이동,
                         오디오 외 파일이 남으면 폴더는 보존(folderKept)
   모든 응답의 moved: [{oldId,newId}] 는 클라이언트
   localStorage 청취 데이터(즐겨찾기·재생수) 리맵에 사용.
   ─────────────────────────────────────────── */

interface MovedPair {
  oldId: string;
  newId: string;
}

function albumPath(name: string): string | null {
  const p = path.join(MUSIC_DIR, name);
  return isInside(MUSIC_DIR, p) ? p : null;
}

export async function POST(req: Request) {
  let body: { name?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "잘못된 요청입니다" }, { status: 400 });
  }
  const name =
    typeof body.name === "string" ? sanitizeAlbumName(body.name) : null;
  if (!name) {
    return Response.json(
      { error: "사용할 수 없는 앨범 이름입니다" },
      { status: 400 }
    );
  }
  const dir = albumPath(name);
  if (!dir) return Response.json({ error: "잘못된 경로입니다" }, { status: 400 });

  try {
    await fs.access(dir);
    return Response.json(
      { error: "같은 이름의 앨범(또는 파일)이 이미 있습니다" },
      { status: 409 }
    );
  } catch {
    // 없음 — 생성 진행
  }
  await fs.mkdir(dir, { recursive: true });
  return Response.json({ ok: true, name });
}

export async function PATCH(req: Request) {
  let body: { from?: unknown; to?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "잘못된 요청입니다" }, { status: 400 });
  }
  const from =
    typeof body.from === "string" ? sanitizeAlbumName(body.from) : null;
  const to = typeof body.to === "string" ? sanitizeAlbumName(body.to) : null;
  if (!from || !to) {
    return Response.json(
      { error: "사용할 수 없는 앨범 이름입니다" },
      { status: 400 }
    );
  }
  if (from === to) return Response.json({ ok: true, name: to, moved: [] });

  const fromDir = albumPath(from);
  const toDir = albumPath(to);
  if (!fromDir || !toDir) {
    return Response.json({ error: "잘못된 경로입니다" }, { status: 400 });
  }

  const stat = await fs.stat(fromDir).catch(() => null);
  if (!stat?.isDirectory()) {
    return Response.json({ error: "앨범을 찾을 수 없습니다" }, { status: 404 });
  }
  const exists = await fs.access(toDir).then(() => true, () => false);
  if (exists) {
    return Response.json(
      { error: "같은 이름의 앨범(또는 파일)이 이미 있습니다" },
      { status: 409 }
    );
  }

  // 리맵 계산용 — 폴더 안 오디오 파일 목록을 이름 변경 전에 수집
  const files = (await fs.readdir(fromDir)).filter(
    (f) => AUDIO_EXTS[path.extname(f).toLowerCase()]
  );
  await fs.rename(fromDir, toDir);

  const moved: MovedPair[] = files.map((f) => ({
    oldId: trackId(`${from}/${f}`),
    newId: trackId(`${to}/${f}`),
  }));
  return Response.json({ ok: true, name: to, moved });
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const raw = url.searchParams.get("name") ?? "";
  const name = sanitizeAlbumName(raw);
  if (!name) {
    return Response.json(
      { error: "사용할 수 없는 앨범 이름입니다" },
      { status: 400 }
    );
  }
  const dir = albumPath(name);
  if (!dir) return Response.json({ error: "잘못된 경로입니다" }, { status: 400 });

  const stat = await fs.stat(dir).catch(() => null);
  if (!stat?.isDirectory()) {
    return Response.json({ error: "앨범을 찾을 수 없습니다" }, { status: 404 });
  }

  // 안의 오디오 파일은 삭제하지 않고 싱글(루트)로 이동 — 충돌 시 " (2)" 접미사
  const entries = await fs.readdir(dir);
  const moved: MovedPair[] = [];
  for (const f of entries) {
    if (!AUDIO_EXTS[path.extname(f).toLowerCase()]) continue;
    const src = path.join(dir, f);
    const st = await fs.stat(src).catch(() => null);
    if (!st?.isFile()) continue;
    const finalName = await uniqueFileName(MUSIC_DIR, f);
    await fs.rename(src, path.join(MUSIC_DIR, finalName));
    moved.push({
      oldId: trackId(`${name}/${f}`),
      newId: trackId(finalName),
    });
  }

  // 폴더 제거 — 오디오 외 파일이 남아 있으면 데이터 보호를 위해 폴더 보존
  let folderKept = false;
  try {
    await fs.rmdir(dir);
  } catch {
    folderKept = true;
  }

  return Response.json({ ok: true, moved, folderKept });
}
