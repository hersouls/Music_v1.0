"use client";

import { useState } from "react";

interface BarChartProps {
  data: number[];
  labels?: string[];
  color?: string;
  height?: number;
  goal?: number;
  formatValue?: (v: number) => string;
  unit?: string;
}

const W = 640;
const PAD_L = 40;
const PAD_R = 16;
const PAD_T = 16;
const PAD_B = 28;

/** 막대 차트 (hover 시 값 표시) — 의존성 0 */
export default function BarChart({
  data,
  labels,
  color = "#7c3aed",
  height = 240,
  goal,
  formatValue = (v) => String(Math.round(v)),
  unit = "",
}: BarChartProps) {
  const H = height;
  const [hover, setHover] = useState<number | null>(null);

  if (!data.length)
    return (
      <div
        className="flex items-center justify-center text-sm text-caption"
        style={{ height: H }}
      >
        데이터가 없습니다
      </div>
    );

  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const n = data.length;
  const max = Math.max(...data, goal ?? 0) * 1.1 || 1;

  const slot = plotW / n;
  const barW = Math.min(36, slot * 0.62);
  const yOf = (v: number) => PAD_T + (1 - v / max) * plotH;

  const gridVals = [0, 0.5, 1].map((t) => t * max);
  const labelStep = Math.max(1, Math.ceil(n / 8));

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
      {gridVals.map((gv, i) => {
        const y = yOf(gv);
        return (
          <g key={i}>
            <line x1={PAD_L} y1={y} x2={W - PAD_R} y2={y} stroke="#f3f4f6" strokeWidth="1" />
            <text x={PAD_L - 8} y={y + 3} textAnchor="end" fontSize="10" fill="#9ca3af">
              {formatValue(gv)}
            </text>
          </g>
        );
      })}

      {goal !== undefined && (
        <line
          x1={PAD_L}
          y1={yOf(goal)}
          x2={W - PAD_R}
          y2={yOf(goal)}
          stroke="#10b981"
          strokeWidth="1.5"
          strokeDasharray="4 4"
        />
      )}

      {data.map((v, i) => {
        const cx = PAD_L + slot * i + slot / 2;
        const y = yOf(v);
        const h = PAD_T + plotH - y;
        const active = hover === i;
        return (
          <g
            key={i}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            <rect
              x={cx - slot / 2}
              y={PAD_T}
              width={slot}
              height={plotH}
              fill="transparent"
            />
            <rect
              x={cx - barW / 2}
              y={y}
              width={barW}
              height={Math.max(0, h)}
              rx="5"
              fill={color}
              opacity={hover === null || active ? 1 : 0.45}
              style={{ transition: "opacity 150ms" }}
            />
            {active && (
              <text
                x={cx}
                y={y - 6}
                textAnchor="middle"
                fontSize="11"
                fontWeight="700"
                fill="#111827"
              >
                {formatValue(v)}
                {unit}
              </text>
            )}
            {labels && i % labelStep === 0 && (
              <text x={cx} y={H - 8} textAnchor="middle" fontSize="10" fill="#9ca3af">
                {labels[i]}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
