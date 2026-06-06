/* ───────────────────────────────────────────
   가사 줄 ↔ Whisper 세그먼트 정렬 (의존성 0, 순수 함수)
   — Whisper 가 돌려준 전사 세그먼트(start·text)의 타임라인에
     붙여넣은 가사 줄을 "글자수 비례"로 매핑해 각 줄 시작 시각을
     추정한다. 완벽한 forced-alignment 는 아니지만 LRC 초안으로
     충분하며, 탭-싱크 에디터의 ±조정으로 마무리한다.
   ─────────────────────────────────────────── */

export interface WhisperSegment {
  start: number;
  end: number;
  text: string;
}

export interface AlignedLine {
  text: string;
  time: number;
}

export function alignLyrics(
  lines: string[],
  segments: WhisperSegment[],
  duration: number
): AlignedLine[] {
  const segs = segments
    .filter((s) => Number.isFinite(s.start))
    .sort((a, b) => a.start - b.start);

  // 전사 타임라인 앵커: (누적 글자수, 시각)
  const anchors: { c: number; t: number }[] = [];
  let cum = 0;
  if (segs.length) {
    for (const s of segs) {
      anchors.push({ c: cum, t: Math.max(0, s.start) });
      cum += Math.max(1, s.text.trim().length);
    }
    const lastEnd = segs[segs.length - 1].end || duration || segs[segs.length - 1].start;
    anchors.push({ c: cum, t: Math.max(anchors[anchors.length - 1].t, lastEnd) });
  }
  const transcriptTotal = cum;

  function timeAtProportion(p: number): number {
    if (!anchors.length) return p * (duration || 0);
    const target = p * transcriptTotal;
    for (let i = 1; i < anchors.length; i++) {
      if (target <= anchors[i].c) {
        const a = anchors[i - 1];
        const b = anchors[i];
        const span = b.c - a.c;
        const f = span > 0 ? (target - a.c) / span : 0;
        return a.t + f * (b.t - a.t);
      }
    }
    return anchors[anchors.length - 1].t;
  }

  const lyricLens = lines.map((l) => Math.max(1, l.trim().length));
  const lyricTotal = lyricLens.reduce((a, b) => a + b, 0);

  let acc = 0;
  const result: AlignedLine[] = lines.map((text, i) => {
    const p = lyricTotal > 0 ? acc / lyricTotal : i / Math.max(1, lines.length);
    acc += lyricLens[i];
    const t =
      transcriptTotal > 0 ? timeAtProportion(p) : p * (duration || 0);
    return { text, time: Math.max(0, Math.round(t * 100) / 100) };
  });

  // 단조 증가 보정 (세그먼트 시각이 흔들려도 줄 순서 역전 방지)
  let last = 0;
  for (const line of result) {
    if (line.time < last) line.time = last;
    last = line.time;
  }
  return result;
}
