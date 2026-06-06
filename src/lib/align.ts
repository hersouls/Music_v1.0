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
  /** Whisper 가 이 구간을 '무음'으로 본 확률 (0~1, 높으면 환각 의심) */
  noSpeechProb?: number;
}

export interface AlignedLine {
  text: string;
  time: number;
}

export type TranscriptIssue = "looping" | "no-speech" | "sparse";

export interface TranscriptAssessment {
  usable: boolean;
  issue?: TranscriptIssue;
}

/* ───────────────────────────────────────────
   전사 신뢰도 평가 — Whisper 가 음악(강한 반주·이중언어·멜로디
   보컬)에서 흔히 일으키는 환각(같은 문구 반복·무음 구간 날조)을
   감지해, 가비지 타임스탬프를 사용자에게 내보내지 않게 한다.
   임계값은 실측 보정: 정상곡(반복0.28·무음0.15·6.1자/초) vs
   환각곡(반복0.93·무음0.69·0.8자/초).
   ─────────────────────────────────────────── */
export function assessTranscription(
  segments: WhisperSegment[],
  duration: number
): TranscriptAssessment {
  const segs = segments.filter((s) => Number.isFinite(s.start));
  const texts = segs.map((s) => (s.text ?? "").trim()).filter(Boolean);
  const chars = texts.join("").replace(/\s/g, "").length;

  // 인식 텍스트가 거의 없음 — 연주곡이거나 보컬 인식 실패
  if (chars < 8) return { usable: false, issue: "no-speech" };

  // 표본이 적으면(짧은 곡) 텍스트만 있으면 통과
  if (segs.length >= 4) {
    const uniq = new Set(texts);
    const repetition = texts.length ? 1 - uniq.size / texts.length : 1;
    if (repetition >= 0.55) return { usable: false, issue: "looping" };

    const noSpeech = segs
      .map((s) => s.noSpeechProb)
      .filter((x): x is number => typeof x === "number");
    if (noSpeech.length) {
      const avg = noSpeech.reduce((a, b) => a + b, 0) / noSpeech.length;
      if (avg >= 0.6) return { usable: false, issue: "no-speech" };
    }
  }

  // 곡 길이 대비 인식 밀도가 비현실적으로 낮음 (정상 가창은 2자/초 이상)
  if (duration > 0 && chars / duration < 1.0) {
    return { usable: false, issue: "sparse" };
  }
  return { usable: true };
}

/** 전사 신호를 사용자용 안내 문구로 */
export function transcriptIssueMessage(issue: TranscriptIssue): string {
  switch (issue) {
    case "looping":
      return "AI가 이 곡의 보컬을 정확히 인식하지 못했어요 (같은 구절이 반복 인식됨). 강한 반주·이중언어 곡에서 자주 생기며, '직접 찍기'로 타이밍을 찍어 주세요.";
    case "no-speech":
      return "이 곡에서 또렷한 보컬을 찾지 못했어요 (연주곡이거나 반주가 강한 경우). '직접 찍기'로 타이밍을 직접 맞춰 주세요.";
    case "sparse":
      return "AI가 가사 일부만 인식해 타이밍이 부정확할 수 있어요. '직접 찍기'로 맞추는 것을 권장해요.";
  }
}

export function alignLyrics(
  lines: string[],
  segments: WhisperSegment[],
  duration: number
): AlignedLine[] {
  // ① 무음 확률이 높은 구간 제거 + ② 연속 동일 문구(루프성 환각) 1개로 축약
  const filtered = segments
    .filter(
      (s) =>
        Number.isFinite(s.start) &&
        (s.noSpeechProb == null || s.noSpeechProb < 0.6)
    )
    .sort((a, b) => a.start - b.start);
  const segs: WhisperSegment[] = [];
  for (const s of filtered) {
    const prev = segs[segs.length - 1];
    if (prev && prev.text.trim() === s.text.trim()) continue;
    segs.push(s);
  }

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
