"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface SectionCardProps {
  title?: string;
  description?: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}

export default function SectionCard({
  title,
  description,
  icon: Icon,
  action,
  children,
  className,
  bodyClassName,
}: SectionCardProps) {
  return (
    <section
      className={cn(
        "rounded-2xl bg-surface-primary border border-strong shadow-sm overflow-hidden",
        className
      )}
    >
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 px-5 py-4 border-b border-base">
          <div className="flex items-center gap-2.5 min-w-0">
            {Icon && (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-bora-50 text-bora-600">
                <Icon className="h-4 w-4" />
              </div>
            )}
            <div className="min-w-0">
              {title && (
                <h2 className="text-base font-bold text-heading truncate">{title}</h2>
              )}
              {description && (
                <p className="text-xs text-caption truncate">{description}</p>
              )}
            </div>
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </section>
  );
}
