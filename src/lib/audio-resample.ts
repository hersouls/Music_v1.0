/* ───────────────────────────────────────────
   WAV → Whisper 입력용 16kHz 모노 16-bit WAV (서버 전용)
   — 원본(48kHz 스테레오 ~40MB)을 음성인식에 충분한 16kHz 모노로
     줄여 OpenAI 25MB 한도를 넘기지 않게 한다. ffmpeg 불필요.
   ─────────────────────────────────────────── */

/** RIFF/WAVE 매직 확인 */
export function isWavBuffer(buf: Buffer): boolean {
  return (
    buf.length >= 44 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WAVE"
  );
}

/** 16-bit PCM WAV 만 지원. 그 외엔 throw */
export function wavBufferToWhisperMono16k(buf: Buffer): Buffer {
  if (!isWavBuffer(buf)) {
    throw new Error("WAV 형식이 아닙니다");
  }

  let off = 12;
  let channels = 0;
  let sampleRate = 0;
  let bits = 0;
  let dataStart = -1;
  let dataLen = 0;

  while (off + 8 <= buf.length) {
    const id = buf.toString("ascii", off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === "fmt ") {
      channels = buf.readUInt16LE(off + 10);
      sampleRate = buf.readUInt32LE(off + 12);
      bits = buf.readUInt16LE(off + 22);
    } else if (id === "data") {
      dataStart = off + 8;
      dataLen = Math.min(size || buf.length - off - 8, buf.length - off - 8);
      break;
    }
    off += 8 + size + (size % 2);
  }

  if (dataStart < 0 || bits !== 16 || !sampleRate || !channels) {
    throw new Error("지원하지 않는 WAV 입니다 (16-bit PCM 필요)");
  }

  const frameBytes = channels * 2;
  const numFrames = Math.floor(dataLen / frameBytes);
  const targetRate = 16000;
  const outFrames = Math.max(1, Math.floor((numFrames * targetRate) / sampleRate));

  const out = Buffer.alloc(44 + outFrames * 2);
  out.write("RIFF", 0);
  out.writeUInt32LE(36 + outFrames * 2, 4);
  out.write("WAVE", 8);
  out.write("fmt ", 12);
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20); // PCM
  out.writeUInt16LE(1, 22); // mono
  out.writeUInt32LE(targetRate, 24);
  out.writeUInt32LE(targetRate * 2, 28);
  out.writeUInt16LE(2, 32);
  out.writeUInt16LE(16, 34);
  out.write("data", 36);
  out.writeUInt32LE(outFrames * 2, 40);

  for (let i = 0; i < outFrames; i++) {
    const srcFrame = Math.min(numFrames - 1, Math.floor((i * sampleRate) / targetRate));
    const base = dataStart + srcFrame * frameBytes;
    let sum = 0;
    for (let c = 0; c < channels; c++) sum += buf.readInt16LE(base + c * 2);
    let v = Math.round(sum / channels);
    if (v > 32767) v = 32767;
    else if (v < -32768) v = -32768;
    out.writeInt16LE(v, 44 + i * 2);
  }

  return out;
}
