/* ───────────────────────────────────────────
   LRC 가사 파서 (의존성 0, 클라이언트/서버 공용)
   — [mm:ss.xx] 타임스탬프(한 줄 다중 태그 지원) → 정렬된
     라인 배열. 타임스탬프가 거의 없으면 일반 텍스트 취급.
   ─────────────────────────────────────────── */

export interface LyricLine {
  /** 초 단위 시작 시각 — 일반 텍스트 가사는 null */
  time: number | null;
  text: string;
}

export interface ParsedLyrics {
  /** true = LRC 싱크 가사 (재생 위치 하이라이트 가능) */
  synced: boolean;
  lines: LyricLine[];
}

const TIME_TAG = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
/** [ti:..][ar:..][offset:..] 등 메타데이터 태그 줄 */
const META_TAG = /^\[[a-zA-Z#][^\]]*\]\s*$/;

export function parseLyrics(content: string): ParsedLyrics {
  const rawLines = content.replace(/\r\n?/g, "\n").split("\n");
  const timed: LyricLine[] = [];
  const plain: string[] = [];

  for (const raw of rawLines) {
    if (META_TAG.test(raw.trim())) continue;

    TIME_TAG.lastIndex = 0;
    const times: number[] = [];
    let m: RegExpExecArray | null;
    let lastEnd = 0;
    while ((m = TIME_TAG.exec(raw)) !== null) {
      // 타임태그는 줄 앞쪽에 연속해 있을 때만 인정 (가사 본문 속 대괄호 오인 방지)
      if (m.index !== lastEnd) break;
      const min = Number(m[1]);
      const sec = Number(m[2]);
      const fracRaw = m[3] ?? "0";
      const frac = Number(fracRaw) / 10 ** fracRaw.length;
      times.push(min * 60 + sec + frac);
      lastEnd = TIME_TAG.lastIndex;
    }

    const text = raw.slice(lastEnd).trim();
    if (times.length) {
      for (const time of times) timed.push({ time, text });
    } else if (raw.trim()) {
      plain.push(raw.trim());
    }
  }

  // 타임스탬프 라인이 2줄 이상이면 싱크 가사로 취급
  if (timed.length >= 2) {
    timed.sort((a, b) => (a.time ?? 0) - (b.time ?? 0));
    return { synced: true, lines: timed };
  }

  const all = [...timed.map((t) => t.text), ...plain].filter(Boolean);
  return {
    synced: false,
    lines: all.map((text) => ({ time: null, text })),
  };
}

/** 저장 시 포맷 감지 — 타임태그 줄이 2개 이상이면 LRC */
export function looksLikeLrc(content: string): boolean {
  const matches = content.match(/^\s*\[\d{1,2}:\d{2}/gm);
  return (matches?.length ?? 0) >= 2;
}

/** 현재 재생 시각의 활성 라인 인덱스 (없으면 -1) */
export function activeLineIndex(
  lines: LyricLine[],
  currentTime: number
): number {
  let active = -1;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].time;
    if (t != null && t <= currentTime) active = i;
    else if (t != null && t > currentTime) break;
  }
  return active;
}

/** 초 → "[mm:ss.xx]" LRC 타임태그 */
export function formatLrcTime(sec: number): string {
  const t = Math.max(0, sec);
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const cs = Math.round((t - Math.floor(t)) * 100);
  // 반올림이 100 이 되면 초로 올림
  const sFix = cs === 100 ? s + 1 : s;
  const csFix = cs === 100 ? 0 : cs;
  return `[${String(m).padStart(2, "0")}:${String(sFix).padStart(2, "0")}.${String(csFix).padStart(2, "0")}]`;
}

/** 탭-싱크 결과(텍스트 줄 + 타임스탬프) → LRC 문자열 */
export function buildLrc(
  lines: { text: string; time: number | null }[]
): string {
  return lines
    .map((l) =>
      l.time != null ? `${formatLrcTime(l.time)}${l.text}` : l.text
    )
    .join("\n");
}

/** 자유 텍스트 → 빈(타임스탬프 없는) 줄 배열. 빈 줄은 ♪ 간주 표기로 보존 */
export function splitLyricLines(text: string): string[] {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.trim());
}
