"use client";

import { cn } from "@/lib/utils";

interface BadgeProps {
  children: React.ReactNode;
  /** 완성된 색상 클래스 (예: "bg-bora-50 text-bora-700") */
  className?: string;
}

export default function Badge({ children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        className || "bg-surface-secondary text-body"
      )}
    >
      {children}
    </span>
  );
}
