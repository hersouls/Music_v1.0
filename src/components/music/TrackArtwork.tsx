"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";
import { artworkSpec } from "@/lib/artwork";

/* ───────────────────────────────────────────
   TrackArtwork — 결정적 SVG 앨범아트 (의존성 0)
   variant 0: 바이닐 링 / 1: 웨이브 / 2: 오브 글로우
   ─────────────────────────────────────────── */

/** 결정적 사인 웨이브 path (seed 로 위상 변형) */
function wavePath(seed: number, amp: number, baseY: number): string {
  const phase = (seed % 100) / 100;
  let d = `M 0 ${baseY}`;
  for (let x = 0; x <= 100; x += 5) {
    const y = baseY + Math.sin((x / 100 + phase) * Math.PI * 3) * amp;
    d += ` L ${x} ${y.toFixed(2)}`;
  }
  return d;
}

export default function TrackArtwork({
  trackId,
  className,
}: {
  trackId: string;
  className?: string;
}) {
  const uid = useId();
  const spec = artworkSpec(trackId);
  const gradId = `art-${uid}`;

  return (
    <svg
      viewBox="0 0 100 100"
      className={cn("block h-full w-full", className)}
      aria-hidden="true"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient
          id={gradId}
          x1="0"
          y1="0"
          x2="1"
          y2="1"
          gradientTransform={`rotate(${spec.angle % 90} 0.5 0.5)`}
        >
          <stop offset="0%" stopColor={spec.from} />
          <stop offset="100%" stopColor={spec.to} />
        </linearGradient>
        <radialGradient id={`${gradId}-glow`} cx="0.8" cy="0.15" r="0.9">
          <stop offset="0%" stopColor="rgba(255,255,255,0.32)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
      </defs>

      <rect width="100" height="100" fill={`url(#${gradId})`} />
      <rect width="100" height="100" fill={`url(#${gradId}-glow)`} />

      {spec.variant === 0 && (
        <g fill="none" stroke="rgba(255,255,255,0.16)">
          {[14, 24, 34, 44].map((r) => (
            <circle key={r} cx="50" cy="50" r={r} strokeWidth="1.1" />
          ))}
          <circle cx="50" cy="50" r="5" fill="rgba(255,255,255,0.85)" stroke="none" />
        </g>
      )}

      {spec.variant === 1 && (
        <g fill="none" strokeLinecap="round">
          <path d={wavePath(spec.seed, 7, 38)} stroke="rgba(255,255,255,0.3)" strokeWidth="2.2" />
          <path d={wavePath(spec.seed + 37, 9, 55)} stroke="rgba(255,255,255,0.18)" strokeWidth="2.2" />
          <path d={wavePath(spec.seed + 71, 6, 70)} stroke="rgba(255,255,255,0.12)" strokeWidth="2.2" />
        </g>
      )}

      {spec.variant === 2 && (
        <g>
          <circle cx="68" cy="34" r="22" fill="rgba(255,255,255,0.2)" />
          <circle cx="32" cy="68" r="14" fill="rgba(255,255,255,0.14)" />
          <circle cx="58" cy="72" r="7" fill={spec.accent} fillOpacity="0.55" />
        </g>
      )}
    </svg>
  );
}
