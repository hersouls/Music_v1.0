import { collection, doc, serverTimestamp, setDoc } from "firebase/firestore";
import {
  getDownloadURL,
  ref,
  uploadBytes,
  uploadBytesResumable,
} from "firebase/storage";
import { getDb, getFirebaseStorage } from "@/lib/firebase";
import { TRACKS_COLLECTION } from "@/lib/firestore-tracks";
import type { Visibility } from "@/types/music";

/* ───────────────────────────────────────────
   곡 업로드 (클라이언트 전용)
   ① WAV 는 RIFF 헤더만 읽어 duration·sampleRate 추출
      (그 외 포맷은 <audio> 메타데이터로 길이 측정)
   ② WAV/FLAC 은 ffmpeg.wasm 으로 192k mp3 변환 → 스트리밍 전송량 ~1/10
      (변환 실패 시 원본만으로 폴백 — 재생은 항상 가능)
   ③ Storage: tracks/{uid}/{trackId}/original.<ext> (+ stream.mp3)
   ④ Firestore tracks 문서 생성 → 구독 중인 보관함에 즉시 반영
   ─────────────────────────────────────────── */

export const AUDIO_EXTS: Record<string, string> = {
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
};

/** 변환 대상 — 무손실(대용량)만 mp3 로. 압축 포맷은 원본 그대로 스트리밍 */
const CONVERT_EXTS = new Set([".wav", ".flac"]);

const MP3_BITRATE = "192k";
const FFMPEG_CORE_BASE = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";

export function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
}

interface WavMeta {
  duration: number;
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
}

function ascii(view: DataView, offset: number, len: number): string {
  let s = "";
  for (let i = 0; i < len; i++) s += String.fromCharCode(view.getUint8(offset + i));
  return s;
}

/** RIFF/WAVE 청크 워커 — 파일 전체를 읽지 않고 청크 헤더만 slice (서버 스캐너 포팅) */
export async function parseWavMeta(file: File): Promise<WavMeta | null> {
  if (file.size < 44) return null;
  const head = new DataView(await file.slice(0, 12).arrayBuffer());
  if (ascii(head, 0, 4) !== "RIFF" || ascii(head, 8, 12 - 8) !== "WAVE") return null;

  let offset = 12;
  let byteRate = 0;
  let sampleRate = 0;
  let channels = 0;
  let bitsPerSample = 0;
  let dataSize = 0;

  while (offset + 8 <= file.size) {
    const hdr = new DataView(await file.slice(offset, offset + 8).arrayBuffer());
    const chunkId = ascii(hdr, 0, 4);
    const chunkSize = hdr.getUint32(4, true);

    if (chunkId === "fmt ") {
      const body = new DataView(
        await file.slice(offset + 8, offset + 24).arrayBuffer()
      );
      channels = body.getUint16(2, true);
      sampleRate = body.getUint32(4, true);
      byteRate = body.getUint32(8, true);
      bitsPerSample = body.getUint16(14, true);
    } else if (chunkId === "data") {
      dataSize = chunkSize;
      // 스트리밍 작성된 WAV(사이즈 0/오버플로)는 실제 남은 바이트로 보정
      const remaining = file.size - offset - 8;
      if (dataSize === 0 || dataSize > remaining) dataSize = remaining;
    }

    if (byteRate > 0 && dataSize > 0) break;
    offset += 8 + chunkSize + (chunkSize % 2); // 청크 2바이트 정렬
  }

  if (!byteRate || !dataSize) return null;
  return {
    duration: dataSize / byteRate,
    sampleRate,
    channels,
    bitsPerSample,
  };
}

/** 비 WAV 포맷 길이 측정 — <audio> 메타데이터 (실패 시 0) */
export function probeDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    audio.preload = "metadata";
    const done = (d: number) => {
      URL.revokeObjectURL(url);
      audio.src = "";
      resolve(Number.isFinite(d) && d > 0 ? d : 0);
    };
    const timer = setTimeout(() => done(0), 10000);
    audio.addEventListener("loadedmetadata", () => {
      clearTimeout(timer);
      done(audio.duration);
    });
    audio.addEventListener("error", () => {
      clearTimeout(timer);
      done(0);
    });
    audio.src = url;
  });
}

/* ── ffmpeg.wasm 싱글톤 (싱글스레드 코어 — COOP/COEP 불필요) ── */

type FFmpegModule = typeof import("@ffmpeg/ffmpeg");
type FFmpegInstance = InstanceType<FFmpegModule["FFmpeg"]>;

let ffmpegPromise: Promise<FFmpegInstance> | null = null;

async function getFfmpeg(): Promise<FFmpegInstance> {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      const [{ FFmpeg }, { toBlobURL }] = await Promise.all([
        import("@ffmpeg/ffmpeg"),
        import("@ffmpeg/util"),
      ]);
      const ffmpeg = new FFmpeg();
      await ffmpeg.load({
        coreURL: await toBlobURL(
          `${FFMPEG_CORE_BASE}/ffmpeg-core.js`,
          "text/javascript"
        ),
        wasmURL: await toBlobURL(
          `${FFMPEG_CORE_BASE}/ffmpeg-core.wasm`,
          "application/wasm"
        ),
      });
      return ffmpeg;
    })();
    ffmpegPromise.catch(() => {
      ffmpegPromise = null; // 로드 실패 시 다음 시도에서 재로드
    });
  }
  return ffmpegPromise;
}

/** WAV/FLAC → 192k mp3 (실패 시 null — 원본 폴백) */
async function convertToMp3(
  file: File,
  onProgress?: (ratio: number) => void
): Promise<Blob | null> {
  try {
    const ffmpeg = await getFfmpeg();
    const { fetchFile } = await import("@ffmpeg/util");
    const inName = `in${extOf(file.name) || ".wav"}`;
    const outName = "out.mp3";

    const progressHandler = ({ progress }: { progress: number }) => {
      if (Number.isFinite(progress)) onProgress?.(Math.min(1, Math.max(0, progress)));
    };
    ffmpeg.on("progress", progressHandler);
    try {
      await ffmpeg.writeFile(inName, await fetchFile(file));
      const code = await ffmpeg.exec([
        "-i", inName,
        "-vn",
        "-b:a", MP3_BITRATE,
        outName,
      ]);
      if (code !== 0) return null;
      const data = await ffmpeg.readFile(outName);
      const bytes = data instanceof Uint8Array ? data : new TextEncoder().encode(data);
      if (bytes.byteLength < 1024) return null;
      return new Blob([bytes.slice()], { type: "audio/mpeg" });
    } finally {
      ffmpeg.off("progress", progressHandler);
      await ffmpeg.deleteFile(inName).catch(() => {});
      await ffmpeg.deleteFile(outName).catch(() => {});
    }
  } catch {
    return null; // wasm 로드/변환 실패 — 원본 스트리밍 폴백
  }
}

/* ── 업로드 오케스트레이션 ── */

export type UploadPhase = "probe" | "convert" | "upload" | "finalize";

export interface UploadCallbacks {
  /** phase 전환 + 0~1 진행률 (convert/upload 만 진행률 제공) */
  onProgress?: (phase: UploadPhase, ratio: number) => void;
}

export interface UploadInput {
  file: File;
  album: string;
  visibility: Visibility;
  uid: string;
  /** 업로더 표시명 — artist 기본값 */
  ownerName: string;
  /** 재시도 시 동일 문서 id 재사용 — 고아 Storage 객체 방지 (없으면 신규 생성) */
  trackId?: string;
}

export interface UploadResult {
  id: string;
  originalUrl: string;
  streamUrl: string | null;
  duration: number;
}

/** 1곡 업로드 — 완료 시 문서 id + 재생 URL (위자드 후속 단계용) 반환 */
export async function uploadTrack(
  { file, album, visibility, uid, ownerName, trackId }: UploadInput,
  { onProgress }: UploadCallbacks = {}
): Promise<UploadResult> {
  const ext = extOf(file.name);
  const contentType = AUDIO_EXTS[ext];
  if (!contentType) throw new Error("지원하지 않는 형식입니다");

  /* ① 메타데이터 */
  onProgress?.("probe", 0);
  const wavMeta = ext === ".wav" ? await parseWavMeta(file) : null;
  const duration = wavMeta?.duration ?? (await probeDuration(file));

  const db = getDb();
  const storage = getFirebaseStorage();
  // 재시도 시 같은 id/경로 재사용 → 직전 시도의 객체를 덮어써 고아를 만들지 않음
  const docRef = trackId
    ? doc(db, TRACKS_COLLECTION, trackId)
    : doc(collection(db, TRACKS_COLLECTION));
  const baseDir = `tracks/${uid}/${docRef.id}`;
  const storagePath = `${baseDir}/original${ext}`;

  /* ② mp3 변환 (무손실 포맷만) — 실패해도 업로드는 계속 */
  let mp3: Blob | null = null;
  if (CONVERT_EXTS.has(ext)) {
    onProgress?.("convert", 0);
    mp3 = await convertToMp3(file, (r) => onProgress?.("convert", r));
  }

  /* ③ 원본 업로드 (진행률) */
  onProgress?.("upload", 0);
  const originalTask = uploadBytesResumable(ref(storage, storagePath), file, {
    contentType,
  });
  await new Promise<void>((resolve, reject) => {
    originalTask.on(
      "state_changed",
      (s) => onProgress?.("upload", s.totalBytes ? s.bytesTransferred / s.totalBytes : 0),
      reject,
      resolve
    );
  });

  /* ④ 스트림 mp3 업로드 (작아서 일괄) */
  let streamPath: string | null = null;
  if (mp3) {
    streamPath = `${baseDir}/stream.mp3`;
    try {
      await uploadBytes(ref(storage, streamPath), mp3, {
        contentType: "audio/mpeg",
      });
    } catch {
      streamPath = null; // 스트림 업로드 실패 — 원본 재생 폴백
    }
  }

  /* ⑤ 다운로드 URL + 문서 생성 */
  onProgress?.("finalize", 0);
  const originalUrl = await getDownloadURL(ref(storage, storagePath));
  const streamUrl = streamPath
    ? await getDownloadURL(ref(storage, streamPath)).catch(() => null)
    : null;

  const title = (ext ? file.name.slice(0, -ext.length) : file.name).trim();
  await setDoc(docRef, {
    ownerUid: uid,
    ownerName,
    title: title || file.name,
    artist: ownerName,
    fileName: file.name,
    album: album.trim(),
    visibility,
    originalUrl,
    streamUrl: streamUrl && streamPath ? streamUrl : null,
    storagePath,
    streamPath: streamUrl ? streamPath : null,
    duration,
    sizeBytes: file.size,
    sampleRate: wavMeta?.sampleRate ?? 0,
    channels: wavMeta?.channels ?? 0,
    bitsPerSample: wavMeta?.bitsPerSample ?? 0,
    lyrics: null,
    lyricsFormat: null,
    coverUrl: null,
    coverPath: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  onProgress?.("finalize", 1);
  return {
    id: docRef.id,
    originalUrl,
    streamUrl: streamUrl && streamPath ? streamUrl : null,
    duration,
  };
}
