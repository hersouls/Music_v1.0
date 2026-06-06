"use client";

import { cn } from "@/lib/utils";

/** 재생 중 인디케이터 — 3-bar 이퀄라이저 (CSS 애니메이션) */
export default function EqBars({
  paused = false,
  className,
}: {
  paused?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn("eq-bars", paused && "eq-bars--paused", className)}
      aria-hidden="true"
    >
      <span />
      <span />
      <span />
    </span>
  );
}
