import { promises as fs } from "node:fs";
import path from "node:path";

/* ───────────────────────────────────────────
   .Music 파일시스템 공용 헬퍼 (서버 전용)
   — 업로드·앨범 관리·곡 이동 라우트가 공유하는
     이름 정제 / 중복 회피 / 경로 격리 유틸
   ─────────────────────────────────────────── */

const FORBIDDEN_CHARS = '<>:"/\\|?*';

/** 경로 구분자·제어문자·Windows 금지문자 제거 — 디렉토리 탈출 차단 */
export function sanitizeFileName(raw: string): string | null {
  const base = Array.from(path.basename(raw))
    .filter((ch) => ch.charCodeAt(0) >= 32 && !FORBIDDEN_CHARS.includes(ch))
    .join("")
    .trim();
  if (!base || base.startsWith(".")) return null;
  return base;
}

/** 앨범 폴더명 정제 — 파일명 규칙 + Windows 금지(말미 마침표·공백) 제거 */
export function sanitizeAlbumName(raw: string): string | null {
  const cleaned = sanitizeFileName(raw);
  if (!cleaned) return null;
  const folder = cleaned.replace(/[. ]+$/, "").trim();
  return folder || null;
}

/** dir 안에서 충돌하지 않는 파일명 — "이름 (2).wav", "이름 (3).wav" … */
export async function uniqueFileName(
  dir: string,
  name: string
): Promise<string> {
  const ext = path.extname(name);
  const stem = path.basename(name, ext);
  let finalName = name;
  for (let i = 2; ; i++) {
    try {
      await fs.access(path.join(dir, finalName));
      finalName = `${stem} (${i})${ext}`;
    } catch {
      return finalName;
    }
  }
}

/** 해석된 경로가 base 디렉토리 안인지 확인 (심층 방어) */
export function isInside(base: string, target: string): boolean {
  return path
    .resolve(target)
    .startsWith(path.resolve(base) + path.sep);
}
