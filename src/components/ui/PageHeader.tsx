"use client";

import type { LucideIcon } from "lucide-react";
import { Plus } from "lucide-react";

interface HeaderAction {
  label: string;
  onClick: () => void;
  icon?: LucideIcon;
}

interface PageHeaderProps {
  title: string;
  description?: string;
  action?: HeaderAction;
  /** 보조 액션 (아웃라인 버튼, 기본 액션 왼쪽에 표시) */
  secondaryAction?: HeaderAction;
}

export default function PageHeader({
  title,
  description,
  action,
  secondaryAction,
}: PageHeaderProps) {
  const ActionIcon = action?.icon ?? Plus;
  const SecondaryIcon = secondaryAction?.icon;

  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-heading">{title}</h1>
        {description && <p className="mt-1 text-sm text-body">{description}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {secondaryAction && (
          <button
            onClick={secondaryAction.onClick}
            aria-label={secondaryAction.label}
            className="flex items-center gap-2 rounded-xl border border-strong bg-surface-primary px-4 py-2.5 text-sm font-medium text-body transition-colors hover:bg-surface-secondary"
          >
            {SecondaryIcon && <SecondaryIcon className="h-4 w-4" aria-hidden="true" />}
            <span className="hidden sm:inline">{secondaryAction.label}</span>
          </button>
        )}
        {action && (
          <button
            onClick={action.onClick}
            aria-label={action.label}
            className="flex items-center gap-2 bg-bora-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-bora-700 transition-colors"
          >
            <ActionIcon className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">{action.label}</span>
          </button>
        )}
      </div>
    </div>
  );
}
