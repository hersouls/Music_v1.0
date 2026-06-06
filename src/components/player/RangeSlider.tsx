"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/* ───────────────────────────────────────────
   RangeSlider — 시킹/볼륨 공용 슬라이더
   드래그 중에는 로컬 값으로 미리보기, 놓을 때 commit.
   immediate=true 면 입력 즉시 commit (볼륨용).
   ─────────────────────────────────────────── */

export default function RangeSlider({
  value,
  max,
  step = 0.1,
  onCommit,
  onScrub,
  immediate = false,
  light = false,
  className,
  ariaLabel,
  disabled,
}: {
  value: number;
  max: number;
  step?: number;
  onCommit: (v: number) => void;
  /** 드래그 중 미리보기 콜백 (시간 라벨 갱신 등) */
  onScrub?: (v: number) => void;
  immediate?: boolean;
  light?: boolean;
  className?: string;
  ariaLabel: string;
  disabled?: boolean;
}) {
  const [drag, setDrag] = useState<number | null>(null);
  const shown = drag ?? value;
  const safeMax = max > 0 ? max : 1;
  const fill = `${Math.min(100, Math.max(0, (shown / safeMax) * 100))}%`;

  function commit() {
    if (drag != null) {
      onCommit(drag);
      setDrag(null);
    }
  }

  return (
    <input
      type="range"
      min={0}
      max={safeMax}
      step={step}
      value={shown}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn(
        "player-range",
        light && "player-range--light",
        disabled && "opacity-40",
        className
      )}
      style={{ "--fill": fill } as React.CSSProperties}
      onChange={(e) => {
        const v = Number(e.target.value);
        if (immediate) {
          onCommit(v);
        } else {
          setDrag(v);
          onScrub?.(v);
        }
      }}
      onPointerUp={commit}
      onKeyUp={commit}
      onBlur={commit}
    />
  );
}
