"use client";

interface SparklineProps {
  data: number[];
  color?: string;
  height?: number;
  fill?: boolean;
}

/** 미니 추세선 (축/라벨 없음) — 통계 카드 내부용 */
export default function Sparkline({
  data,
  color = "#7c3aed",
  height = 36,
  fill = true,
}: SparklineProps) {
  const W = 120;
  const H = height;
  if (!data.length) return <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} />;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pad = 3;
  const n = data.length;
  const pts = data.map((v, i) => {
    const x = n === 1 ? W / 2 : pad + (i * (W - pad * 2)) / (n - 1);
    const y = pad + (1 - (v - min) / range) * (H - pad * 2);
    return [x, y] as const;
  });
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${pad},${H - pad} ${line} ${W - pad},${H - pad}`;
  const gid = `spark-${color.replace("#", "")}`;

  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && <polygon points={area} fill={`url(#${gid})`} />}
      <polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
