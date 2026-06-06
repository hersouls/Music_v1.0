"use client";

import { useToastStore } from "@/stores/useToastStore";
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from "lucide-react";

const iconMap = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
  warning: AlertTriangle,
};

const colorMap = {
  success: "border-l-emerald-500 bg-surface-primary",
  error: "border-l-red-500 bg-surface-primary",
  info: "border-l-blue-500 bg-surface-primary",
  warning: "border-l-amber-500 bg-surface-primary",
};

const iconColorMap = {
  success: "text-emerald-500",
  error: "text-red-500",
  info: "text-blue-500",
  warning: "text-amber-500",
};

export default function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[70] flex flex-col-reverse gap-2 max-w-sm">
      {toasts.map((toast) => {
        const Icon = iconMap[toast.type];
        const urgent = toast.type === "error" || toast.type === "warning";
        return (
          <div
            key={toast.id}
            role={urgent ? "alert" : "status"}
            aria-live={urgent ? "assertive" : "polite"}
            className={`flex items-start gap-3 rounded-xl border-l-4 px-4 py-3 shadow-lg ring-1 ring-gray-200 animate-slide-up ${colorMap[toast.type]}`}
          >
            <Icon
              className={`h-5 w-5 shrink-0 mt-0.5 ${iconColorMap[toast.type]}`}
              aria-hidden="true"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-heading">{toast.message}</p>
              {toast.action && (
                <button
                  onClick={() => {
                    toast.action!.onClick();
                    removeToast(toast.id);
                  }}
                  className="mt-1 text-xs font-bold text-bora-600 hover:text-bora-700"
                >
                  {toast.action.label}
                </button>
              )}
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              aria-label="알림 닫기"
              className="shrink-0 text-caption hover:text-body"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
