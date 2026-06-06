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

const MUSIC_DIR = path.join(process.cwd(), ".Music");

const AUDIO_EXTS: Record<string, string> = {
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
    };
  } catch {
    return null;
  } finally {
    await fh.close();
  }
}

/* 모듈 캐시 — 디렉토리 변경(파일명·크기·mtime) 시에만 WAV 헤더 재파싱 */
let cache: { key: string; tracks: Track[] } | null = null;

function trackId(fileName: string): string {
  return crypto.createHash("md5").update(fileName).digest("hex").slice(0, 12);
}

export async function getTracks(): Promise<Track[]> {
  let entries: { name: string; size: number; mtimeMs: number }[] = [];
  try {
    const names = await fs.readdir(MUSIC_DIR);
    const stats = await Promise.all(
      names
        .filter((n) => AUDIO_EXTS[path.extname(n).toLowerCase()])
        .map(async (name) => {
          const st = await fs.stat(path.join(MUSIC_DIR, name));
          return { name, size: st.size, mtimeMs: st.mtimeMs };
        })
    );
    entries = stats;
  } catch {
    return []; // .Music 폴더 없음 — 빈 보관함
  }

  const key = entries
    .map((e) => `${e.name}:${e.size}:${Math.round(e.mtimeMs)}`)
    .sort()
    .join("|");
  if (cache && cache.key === key) return cache.tracks;

  const tracks = await Promise.all(
    entries.map(async ({ name, size }): Promise<Track> => {
      const ext = path.extname(name).toLowerCase();
      const isWav = ext === ".wav";
      const meta = isWav ? await readWavMeta(path.join(MUSIC_DIR, name)) : null;
      const id = trackId(name);
      return {
        id,
        title: path.basename(name, path.extname(name)).trim(),
        artist: ARTIST_NAME,
        fileName: name,
        src: `/api/stream/${id}`,
        duration: meta?.duration ?? 0,
        sizeBytes: size,
        sampleRate: meta?.sampleRate ?? 0,
        channels: meta?.channels ?? 0,
        bitsPerSample: meta?.bitsPerSample ?? 0,
      };
    })
  );

  tracks.sort((a, b) => a.title.localeCompare(b.title, "ko"));
  cache = { key, tracks };
  return tracks;
}

/** 스트리밍 라우트용 — id → 실제 파일 경로/크기/타입 */
export async function resolveTrackFile(
  id: string
): Promise<{ filePath: string; size: number; contentType: string } | null> {
  const tracks = await getTracks();
  const track = tracks.find((t) => t.id === id);
  if (!track) return null;
  const ext = path.extname(track.fileName).toLowerCase();
  return {
    filePath: path.join(MUSIC_DIR, track.fileName),
    size: track.sizeBytes,
    contentType: AUDIO_EXTS[ext] ?? "application/octet-stream",
  };
}
