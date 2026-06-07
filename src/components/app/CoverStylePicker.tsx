"use client";

import { COVER_STYLES } from "@/lib/cover-styles";
import { cn } from "@/lib/utils";

/* ───────────────────────────────────────────
   CoverStylePicker — AI 커버 스타일 칩 선택
   ─────────────────────────────────────────── */

export default function CoverStylePicker({
  value,
  onSelect,
  disabled,
  className,
}: {
  value: string;
  onSelect: (id: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap justify-center gap-1.5", className)}>
      {COVER_STYLES.map((s) => {
        const active = value === s.id;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onSelect(s.id)}
            disabled={disabled}
            aria-pressed={active}
            title={s.desc}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium transition-all disabled:opacity-50",
              active
                ? "border-bora-300 bg-bora-600 text-white shadow-sm"
                : "border-strong bg-surface-primary text-body hover:border-bora-300 hover:bg-bora-50 hover:text-bora-700"
            )}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}
