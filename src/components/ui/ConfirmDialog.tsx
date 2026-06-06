"use client";

import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import { Fragment } from "react";
import { useDialogStore } from "@/stores/useDialogStore";
import { AlertTriangle, Loader2 } from "lucide-react";

export default function ConfirmDialog() {
  const { isOpen, config, loading, closeDialog, setLoading } = useDialogStore();

  if (!config) return null;

  const isDanger = config.variant === "danger";

  async function handleConfirm() {
    setLoading(true);
    try {
      await config!.onConfirm();
      closeDialog();
    } catch {
      setLoading(false);
    }
  }

  return (
    <Transition show={isOpen} as={Fragment}>
      <Dialog onClose={closeDialog} className="relative z-[60]">
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/30" />
        </TransitionChild>

        <div className="fixed inset-0 flex items-center justify-center p-4">
          <TransitionChild
            as={Fragment}
            enter="ease-out duration-200"
            enterFrom="opacity-0 scale-95"
            enterTo="opacity-100 scale-100"
            leave="ease-in duration-150"
            leaveFrom="opacity-100 scale-100"
            leaveTo="opacity-0 scale-95"
          >
            <DialogPanel className="w-full max-w-sm rounded-2xl bg-surface-primary p-6 shadow-xl">
              <div className="flex items-start gap-4">
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                    isDanger ? "bg-red-50" : "bg-amber-50"
                  }`}
                >
                  <AlertTriangle
                    className={`h-5 w-5 ${isDanger ? "text-red-500" : "text-amber-500"}`}
                  />
                </div>
                <div>
                  <DialogTitle className="text-base font-bold text-heading">
                    {config.title}
                  </DialogTitle>
                  <p className="mt-1 text-sm text-body">{config.description}</p>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-end gap-3">
                <button
                  onClick={closeDialog}
                  disabled={loading}
                  className="px-4 py-2 rounded-xl text-sm font-medium text-body hover:bg-surface-tertiary transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={loading}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-colors disabled:opacity-50 ${
                    isDanger
                      ? "bg-red-600 hover:bg-red-700"
                      : "bg-amber-600 hover:bg-amber-700"
                  }`}
                >
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  {config.confirmLabel ?? "확인"}
                </button>
              </div>
            </DialogPanel>
          </TransitionChild>
        </div>
      </Dialog>
    </Transition>
  );
}
