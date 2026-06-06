import { promises as fs } from "node:fs";
import path from "node:path";

/* ───────────────────────────────────────────
   곡 등록 — 업로드 파일을 .Music 폴더에 저장
   파일 1개씩 multipart/form-data 로 받는다 (필드명 "file",
   선택 필드 "album" — 지정 시 .Music/<앨범>/ 하위 폴더에 저장).
   보안: 파일명·앨범명 정제(경로 탈출 차단) + 확장자 허용목록 +
        WAV 매직바이트 검증 + 중복 파일명은 " (2)" 접미사로 원본 보존.
   ─────────────────────────────────────────── */

const MUSIC_DIR = path.join(process.cwd(), ".Music");

const ALLOWED_EXTS = new Set([".wav", ".mp3", ".m4a", ".aac", ".ogg", ".flac"]);
const MAX_SIZE = 1024 * 1024 * 1024; // 1GB

const FORBIDDEN_CHARS = '<>:"/\\|?*';

/** 경로 구분자·제어문자·Windows 금지문자 제거 — 디렉토리 탈출 차단 */
function sanitizeName(raw: string): string | null {
  const base = Array.from(path.basename(raw))
    .filter((ch) => ch.charCodeAt(0) >= 32 && !FORBIDDEN_CHARS.includes(ch))
    .join("")
    .trim();
  if (!base || base.startsWith(".")) return null;
  return base;
}

/** 앨범 폴더명 정제 — 파일명 규칙 + Windows 금지(말미 마침표·공백) 제거 */
function sanitizeAlbum(raw: string): string | null {
  const cleaned = sanitizeName(raw);
  if (!cleaned) return null;
  const folder = cleaned.replace(/[. ]+$/, "").trim();
  return folder || null;
}

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "잘못된 요청입니다" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "파일이 없습니다" }, { status: 400 });
  }

  const name = sanitizeName(file.name);
  if (!name) {
    return Response.json({ error: "사용할 수 없는 파일명입니다" }, { status: 400 });
  }

  const ext = path.extname(name).toLowerCase();
  if (!ALLOWED_EXTS.has(ext)) {
    return Response.json(
      { error: "지원하지 않는 형식입니다 (WAV·MP3·M4A·AAC·OGG·FLAC)" },
      { status: 415 }
    );
  }
  if (file.size === 0) {
    return Response.json({ error: "빈 파일입니다" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return Response.json({ error: "파일이 너무 큽니다 (최대 1GB)" }, { status: 413 });
  }

  const buf = Buffer.from(await file.arrayBuffer());

  // WAV 는 RIFF/WAVE 매직바이트 검증 (스캐너가 읽지 못하는 깨진 파일 차단)
  if (
    ext === ".wav" &&
    (buf.length < 44 ||
      buf.toString("ascii", 0, 4) !== "RIFF" ||
      buf.toString("ascii", 8, 12) !== "WAVE")
  ) {
    return Response.json({ error: "올바른 WAV 파일이 아닙니다" }, { status: 415 });
  }

  // 앨범 지정 시 .Music/<앨범>/ 하위 폴더에 저장
  const albumRaw = form.get("album");
  let album = "";
  if (typeof albumRaw === "string" && albumRaw.trim()) {
    const folder = sanitizeAlbum(albumRaw);
    if (!folder) {
      return Response.json(
        { error: "사용할 수 없는 앨범 이름입니다" },
        { status: 400 }
      );
    }
    album = folder;
  }

  const destDir = album ? path.join(MUSIC_DIR, album) : MUSIC_DIR;
  await fs.mkdir(destDir, { recursive: true });

  // 중복 파일명 — 덮어쓰지 않고 " (2)", " (3)" … 접미사
  const stem = path.basename(name, ext);
  let finalName = name;
  for (let i = 2; ; i++) {
    try {
      await fs.access(path.join(destDir, finalName));
      finalName = `${stem} (${i})${ext}`;
    } catch {
      break;
    }
  }

  const target = path.resolve(destDir, finalName);
  if (!target.startsWith(path.resolve(MUSIC_DIR) + path.sep)) {
    return Response.json({ error: "잘못된 경로입니다" }, { status: 400 });
  }

  await fs.writeFile(target, buf);
  return Response.json({ ok: true, fileName: finalName, album });
}
