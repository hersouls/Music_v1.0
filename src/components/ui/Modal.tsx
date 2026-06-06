"use client";

import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import { Fragment } from "react";
import { X } from "lucide-react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** 헤더 우측(닫기 버튼 왼쪽)에 표시할 액션 — 예: 미리보기의 "수정" */
  headerAction?: React.ReactNode;
}

export default function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  headerAction,
}: ModalProps) {
  return (
    <Transition show={open} as={Fragment}>
      <Dialog onClose={onClose} className="relative z-50">
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

        <div className="fixed inset-0 flex items-end sm:items-center justify-center">
          <TransitionChild
            as={Fragment}
            enter="ease-out duration-200"
            enterFrom="opacity-0 translate-y-full sm:translate-y-0 sm:scale-95"
            enterTo="opacity-100 translate-y-0 sm:scale-100"
            leave="ease-in duration-150"
            leaveFrom="opacity-100 translate-y-0 sm:scale-100"
            leaveTo="opacity-0 translate-y-full sm:translate-y-0 sm:scale-95"
          >
            <DialogPanel className="w-full max-w-lg bg-surface-primary rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[85dvh] flex flex-col sm:mx-4">
              {/* Header */}
              <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-base">
                <DialogTitle className="text-lg font-bold text-heading">
                  {title}
                </DialogTitle>
                <div className="flex items-center gap-1.5">
                  {headerAction}
                  <button
                    onClick={onClose}
                    aria-label="닫기"
                    className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-surface-tertiary text-caption hover:text-body"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Body */}
              <div
                className="flex-1 overflow-y-auto px-6 py-4"
                style={{ scrollbarWidth: "thin" }}
              >
                {children}
              </div>

              {/* Footer */}
              {footer && <div className="px-6 py-4 border-t border-base">{footer}</div>}
            </DialogPanel>
          </TransitionChild>
        </div>
      </Dialog>
    </Transition>
  );
}
