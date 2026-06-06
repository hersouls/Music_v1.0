import { create } from "zustand";

interface DialogConfig {
  title: string;
  description: string;
  confirmLabel?: string;
  variant?: "danger" | "warning";
  onConfirm: () => void | Promise<void>;
}

interface DialogState {
  isOpen: boolean;
  config: DialogConfig | null;
  loading: boolean;
  openDialog: (config: DialogConfig) => void;
  closeDialog: () => void;
  setLoading: (loading: boolean) => void;
}

export const useDialogStore = create<DialogState>((set) => ({
  isOpen: false,
  config: null,
  loading: false,
  openDialog: (config) => set({ isOpen: true, config, loading: false }),
  closeDialog: () => set({ isOpen: false, config: null, loading: false }),
  setLoading: (loading) => set({ loading }),
}));
