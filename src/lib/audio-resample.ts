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

/** PCM(16/24/32-bit) · IEEE float(32-bit) WAV 지원. 그 외엔 throw.
    무손실 보존용 24/32-bit WAV 도 AI 싱크가 되도록 16-bit 로 다운컨버트. */
export function wavBufferToWhisperMono16k(buf: Buffer): Buffer {
  if (!isWavBuffer(buf)) {
    throw new Error("WAV 형식이 아닙니다");
  }

  let off = 12;
  let format = 0; // 1=PCM, 3=IEEE float
  let channels = 0;
  let sampleRate = 0;
  let bits = 0;
  let dataStart = -1;
  let dataLen = 0;

  while (off + 8 <= buf.length) {
    const id = buf.toString("ascii", off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === "fmt ") {
      format = buf.readUInt16LE(off + 8);
      channels = buf.readUInt16LE(off + 10);
      sampleRate = buf.readUInt32LE(off + 12);
      bits = buf.readUInt16LE(off + 22);
      // WAVE_FORMAT_EXTENSIBLE(0xFFFE) — 서브포맷 GUID 첫 2바이트가 실제 포맷
      if (format === 0xfffe && size >= 40) {
        format = buf.readUInt16LE(off + 8 + 24);
      }
    } else if (id === "data") {
      dataStart = off + 8;
      dataLen = Math.min(size || buf.length - off - 8, buf.length - off - 8);
      break;
    }
    off += 8 + size + (size % 2);
  }

  const bytesPerSample = bits / 8;
  const isPcm = format === 1 && (bits === 16 || bits === 24 || bits === 32);
  const isFloat = format === 3 && bits === 32;
  if (dataStart < 0 || !sampleRate || !channels || (!isPcm && !isFloat)) {
    throw new Error("지원하지 않는 WAV 입니다 (PCM 16/24/32-bit 또는 float)");
  }

  /** 한 샘플(채널) 을 -32768..32767 로 정규화해 읽기 */
  function readSample(pos: number): number {
    if (isFloat) {
      const f = buf.readFloatLE(pos);
      return Math.max(-32768, Math.min(32767, Math.round(f * 32767)));
    }
    if (bits === 16) return buf.readInt16LE(pos);
    if (bits === 24) {
      // 24-bit 리틀엔디언 부호 → 상위 16비트만
      let v = buf[pos] | (buf[pos + 1] << 8) | (buf[pos + 2] << 16);
      if (v & 0x800000) v -= 0x1000000; // 부호 확장
      return v >> 8;
    }
    // 32-bit int
    return buf.readInt32LE(pos) >> 16;
  }

  const frameBytes = channels * bytesPerSample;
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
    for (let c = 0; c < channels; c++) sum += readSample(base + c * bytesPerSample);
    let v = Math.round(sum / channels);
    if (v > 32767) v = 32767;
    else if (v < -32768) v = -32768;
    out.writeInt16LE(v, 44 + i * 2);
  }

  return out;
}
