import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { Track } from "@/types/music";
import { ARTIST_NAME } from "@/lib/constants";

/* ───────────────────────────────────────────
   .Music 폴더 스캐너 (서버 전용)
   — WAV 헤더(RIFF)를 직접 파싱해 길이·샘플레이트를 얻는다.
     파일 전체를 읽지 않고 청크 헤더만 순회 (대용량 안전).
   ─────────────────────────────────────────── */

export const MUSIC_DIR = path.join(process.cwd(), ".Music");

export const AUDIO_EXTS: Record<string, string> = {
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
};

interface WavMeta {
  duration: number;
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  /** LIST INFO ICMT 에서 추출한 Suno clip id (없으면 "") */
  sunoId: string;
}

/** LIST(INFO) 청크 본문에서 ICMT 코멘트 → "id=<uuid>" 추출 */
function parseSunoIdFromList(body: Buffer): string {
  if (body.length < 4 || body.toString("ascii", 0, 4) !== "INFO") return "";
  let pos = 4;
  while (pos + 8 <= body.length) {
    const subId = body.toString("ascii", pos, pos + 4);
    const subSize = body.readUInt32LE(pos + 4);
    if (subSize > body.length - pos - 8) break;
    if (subId === "ICMT") {
      const comment = body
        .toString("utf8", pos + 8, pos + 8 + subSize)
        .replace(/\0+$/, "");
      const m = /id=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i.exec(
        comment
      );
      return m ? m[1] : "";
    }
    pos += 8 + subSize + (subSize % 2);
  }
  return "";
}

/** RIFF/WAVE 청크 워커 — fmt(byteRate)·data(size)만 읽어 duration 계산 */
async function readWavMeta(filePath: string): Promise<WavMeta | null> {
  const fh = await fs.open(filePath, "r");
  try {
    const { size: fileSize } = await fh.stat();
    if (fileSize < 44) return null;

    const riff = Buffer.alloc(12);
    await fh.read(riff, 0, 12, 0);
    if (riff.toString("ascii", 0, 4) !== "RIFF" || riff.toString("ascii", 8, 12) !== "WAVE") {
      return null;
    }

    let offset = 12;
    let byteRate = 0;
    let sampleRate = 0;
    let channels = 0;
    let bitsPerSample = 0;
    let dataSize = 0;
    let sunoId = "";
    const header = Buffer.alloc(8);

    while (offset + 8 <= fileSize) {
      await fh.read(header, 0, 8, offset);
      const chunkId = header.toString("ascii", 0, 4);
      const chunkSize = header.readUInt32LE(4);

      if (chunkId === "fmt ") {
        const body = Buffer.alloc(16);
        await fh.read(body, 0, 16, offset + 8);
        channels = body.readUInt16LE(2);
        sampleRate = body.readUInt32LE(4);
        byteRate = body.readUInt32LE(8);
        bitsPerSample = body.readUInt16LE(14);
      } else if (chunkId === "LIST" && chunkSize >= 4 && chunkSize <= 65536) {
        // INFO 메타데이터 — Suno 가 ICMT 에 clip id 를 기록
        const body = Buffer.alloc(chunkSize);
        await fh.read(body, 0, chunkSize, offset + 8);
        if (!sunoId) sunoId = parseSunoIdFromList(body);
      } else if (chunkId === "data") {
        dataSize = chunkSize;
        // 스트리밍 작성된 WAV(사이즈 0/오버플로)는 실제 남은 바이트로 보정
        const remaining = fileSize - offset - 8;
        if (dataSize === 0 || dataSize > remaining) dataSize = remaining;
      }

      if (byteRate > 0 && dataSize > 0) break;
      // 청크는 2바이트 정렬 (홀수 크기면 패딩 1바이트)
      offset += 8 + chunkSize + (chunkSize % 2);
    }

    if (!byteRate || !dataSize) return null;
    return {
      duration: dataSize / byteRate,
      sampleRate,
      channels,
      bitsPerSample,
      sunoId,
    };
  } catch {
    return null;
  } finally {
    await fh.close();
  }
}

/* 모듈 캐시 — 디렉토리 변경(경로·크기·mtime) 시에만 WAV 헤더 재파싱 */
let cache: { key: string; tracks: Track[] } | null = null;

/** id = 상대경로 해시 — 루트 파일은 relPath === fileName 이라 기존 id 와 동일(청취 데이터 보존).
    경로 구분자는 항상 "/" (이동·이름변경 라우트의 id 리맵 계산에도 사용) */
export function trackId(relPath: string): string {
  return crypto.createHash("md5").update(relPath).digest("hex").slice(0, 12);
}

interface ScanEntry {
  relPath: string;
  fileName: string;
  album: string;
  size: number;
  mtimeMs: number;
}

/** .Music 1단계 스캔 — 루트 오디오 파일 + 하위 폴더(=앨범) 안의 오디오 파일 */
async function scanEntries(): Promise<ScanEntry[]> {
  const out: ScanEntry[] = [];
  const dirents = await fs.readdir(MUSIC_DIR, { withFileTypes: true });
  for (const d of dirents) {
    if (d.name.startsWith(".")) continue;
    if (d.isFile()) {
      if (!AUDIO_EXTS[path.extname(d.name).toLowerCase()]) continue;
      const st = await fs.stat(path.join(MUSIC_DIR, d.name));
      out.push({
        relPath: d.name,
        fileName: d.name,
        album: "",
        size: st.size,
        mtimeMs: st.mtimeMs,
      });
    } else if (d.isDirectory()) {
      // 폴더명 = 앨범명 (1단계 깊이만 — 더 깊은 중첩은 무시)
      let subNames: string[] = [];
      try {
        subNames = await fs.readdir(path.join(MUSIC_DIR, d.name));
      } catch {
        continue;
      }
      for (const f of subNames) {
        if (!AUDIO_EXTS[path.extname(f).toLowerCase()]) continue;
        const full = path.join(MUSIC_DIR, d.name, f);
        const st = await fs.stat(full);
        if (!st.isFile()) continue;
        out.push({
          relPath: `${d.name}/${f}`,
          fileName: f,
          album: d.name,
          size: st.size,
          mtimeMs: st.mtimeMs,
        });
      }
    }
  }
  return out;
}

export async function getTracks(): Promise<Track[]> {
  let entries: ScanEntry[] = [];
  try {
    entries = await scanEntries();
  } catch {
    return []; // .Music 폴더 없음 — 빈 보관함
  }

  const key = entries
    .map((e) => `${e.relPath}:${e.size}:${Math.round(e.mtimeMs)}`)
    .sort()
    .join("|");
  if (cache && cache.key === key) return cache.tracks;

  const tracks = await Promise.all(
    entries.map(async ({ relPath, fileName, album, size }): Promise<Track> => {
      const ext = path.extname(fileName).toLowerCase();
      const isWav = ext === ".wav";
      const meta = isWav
        ? await readWavMeta(path.join(MUSIC_DIR, relPath))
        : null;
      const id = trackId(relPath);
      return {
        id,
        title: path.basename(fileName, path.extname(fileName)).trim(),
        artist: ARTIST_NAME,
        fileName,
        relPath,
        album,
        src: `/api/stream/${id}`,
        duration: meta?.duration ?? 0,
        sizeBytes: size,
        sampleRate: meta?.sampleRate ?? 0,
        channels: meta?.channels ?? 0,
        bitsPerSample: meta?.bitsPerSample ?? 0,
        sunoId: meta?.sunoId ?? "",
      };
    })
  );

  // 앨범명 → 곡 제목 순 (루트 "" 가 먼저 오지만 그룹 순서는 UI 가 결정)
  tracks.sort(
    (a, b) =>
      a.album.localeCompare(b.album, "ko") ||
      a.title.localeCompare(b.title, "ko")
  );
  cache = { key, tracks };
  return tracks;
}

/** 모든 앨범 폴더 이름 (빈 폴더 포함 — 앨범 관리 UI 용) */
export async function getAlbumDirs(): Promise<string[]> {
  try {
    const dirents = await fs.readdir(MUSIC_DIR, { withFileTypes: true });
    return dirents
      .filter((d) => d.isDirectory() && !d.name.startsWith("."))
      .map((d) => d.name)
      .sort((a, b) => a.localeCompare(b, "ko"));
  } catch {
    return [];
  }
}

/** 스트리밍 라우트용 — id → 실제 파일 경로/크기/타입 */
export async function resolveTrackFile(
  id: string
): Promise<{ filePath: string; size: number; contentType: string } | null> {
  const tracks = await getTracks();
  const track = tracks.find((t) => t.id === id);
  if (!track) return null;
  const ext = path.extname(track.fileName).toLowerCase();
  // 심층 방어 — 해석된 경로가 .Music 밖이면 거부 (relPath 는 스캔 산출이라 정상 경로만 존재)
  const filePath = path.resolve(MUSIC_DIR, track.relPath);
  if (!filePath.startsWith(path.resolve(MUSIC_DIR) + path.sep)) return null;
  return {
    filePath,
    size: track.sizeBytes,
    contentType: AUDIO_EXTS[ext] ?? "application/octet-stream",
  };
}
