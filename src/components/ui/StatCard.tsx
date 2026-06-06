"use client";

import type { LucideIcon } from "lucide-react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  icon: LucideIcon;
  /** 아이콘 박스 색상 클래스 (예: "text-bora-600 bg-bora-50") */
  iconClassName?: string;
  unit?: string;
  sub?: React.ReactNode;
  loading?: boolean;
  onClick?: () => void;
}

export default function StatCard({
  label,
  value,
  icon: Icon,
  iconClassName = "text-bora-600 bg-bora-50",
  unit,
  sub,
  loading,
  onClick,
}: StatCardProps) {
  const Wrapper = onClick ? "button" : "div";
  return (
    <Wrapper
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-2xl bg-surface-primary p-6 border border-strong shadow-sm",
        onClick &&
          "transition-all hover:border-bora-200 hover:shadow-md active:scale-[0.99]"
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-body">{label}</span>
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-xl",
            iconClassName
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <div className="mt-3 flex items-baseline gap-1">
        {loading ? (
          <Loader2 className="h-6 w-6 animate-spin text-caption" />
        ) : (
          <>
            <p className="text-2xl font-bold text-heading">{value}</p>
            {unit && <span className="text-sm font-medium text-caption">{unit}</span>}
          </>
        )}
      </div>
      {sub && !loading && <div className="mt-1 text-xs text-caption">{sub}</div>}
    </Wrapper>
  );
}
