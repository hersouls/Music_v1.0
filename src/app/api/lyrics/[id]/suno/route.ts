import { promises as fs } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { MUSIC_DIR, getTracks } from "@/lib/tracks.server";
import { looksLikeLrc } from "@/lib/lrc";
import { isInside } from "@/lib/music-fs";

const execFileAsync = promisify(execFile);

/* ───────────────────────────────────────────
   Suno 가사 가져오기 — POST
   WAV ICMT 에 박힌 Suno clip id 로 로컬 suno-cli 를 호출해
   단어 단위 타임스탬프 LRC 를 받아 사이드카로 저장한다.
   요구: tools/suno.exe + `suno auth --login` 선행(사용자).
   ─────────────────────────────────────────── */

const SUNO_BIN = path.join(
  process.cwd(),
  "tools",
  process.platform === "win32" ? "suno.exe" : "suno"
);

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const tracks = await getTracks();
  const track = tracks.find((t) => t.id === id);
  if (!track) {
    return Response.json({ error: "트랙을 찾을 수 없습니다" }, { status: 404 });
  }
  if (!track.sunoId) {
    return Response.json(
      { error: "이 곡에는 Suno clip id 가 없습니다 (Suno 생성곡 WAV 만 지원)" },
      { status: 422 }
    );
  }

  const hasBin = await fs.access(SUNO_BIN).then(() => true, () => false);
  if (!hasBin) {
    return Response.json(
      { error: "suno-cli 가 설치되어 있지 않습니다 (tools/suno.exe)" },
      { status: 503 }
    );
  }

  let stdout = "";
  try {
    const result = await execFileAsync(
      SUNO_BIN,
      ["timed-lyrics", track.sunoId, "--lrc"],
      { timeout: 30_000, maxBuffer: 2 * 1024 * 1024, windowsHide: true }
    );
    stdout = result.stdout;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const stderr =
      typeof e === "object" && e && "stderr" in e ? String(e.stderr) : "";
    const hint = /auth|login|unauthorized|401/i.test(stderr + msg)
      ? "Suno 인증이 필요합니다 — 터미널에서 tools\\suno.exe auth --login 을 실행하세요"
      : "suno-cli 실행에 실패했습니다";
    return Response.json(
      { error: hint, detail: (stderr || msg).slice(0, 300) },
      { status: 502 }
    );
  }

  const content = stdout.trim();
  if (!content || !looksLikeLrc(content)) {
    return Response.json(
      {
        error: "Suno 에서 타임스탬프 가사를 받지 못했습니다 (인증 또는 가사 없는 곡)",
        detail: content.slice(0, 300),
      },
      { status: 502 }
    );
  }

  // 사이드카 저장 — .lrc 로 저장하고 .txt 잔재 제거
  const dir = path.join(MUSIC_DIR, path.dirname(track.relPath));
  const stem = path.basename(track.fileName, path.extname(track.fileName));
  const lrcPath = path.join(dir, `${stem}.lrc`);
  if (!isInside(MUSIC_DIR, lrcPath)) {
    return Response.json({ error: "잘못된 경로입니다" }, { status: 400 });
  }
  await fs.writeFile(lrcPath, content, "utf8");
  await fs.rm(path.join(dir, `${stem}.txt`), { force: true });

  return Response.json({ ok: true, format: "lrc" });
}
