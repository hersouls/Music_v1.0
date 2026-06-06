import { create } from "zustand";
import { DEFAULT_TOAST_DURATION, MAX_VISIBLE_TOASTS } from "@/lib/constants";

export interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info" | "warning";
  action?: { label: string; onClick: () => void };
  duration?: number;
}

interface ToastState {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, "id">) => void;
  removeToast: (id: string) => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  addToast: (toast) => {
    const id = crypto.randomUUID();
    set((state) => ({
      toasts: [...state.toasts.slice(-MAX_VISIBLE_TOASTS), { ...toast, id }],
    }));
    const duration = toast.duration ?? DEFAULT_TOAST_DURATION;
    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((t) => t.id !== id),
      }));
    }, duration);
  },
  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
}));
