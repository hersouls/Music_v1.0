"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useToastStore } from "@/stores/useToastStore";
import { formatBytes } from "@/lib/format";
import { uid, cn } from "@/lib/utils";
import Modal from "@/components/ui/Modal";
import {
  Upload,
  FileAudio,
  X,
  Loader2,
  CheckCircle2,
  XCircle,
  Music2,
} from "lucide-react";

/* ───────────────────────────────────────────
   곡 등록 모달 — 드래그&드롭/선택한 오디오 파일을
   /api/upload 로 1개씩 순차 업로드해 .Music 에 저장.
   완료 시 router.refresh() → 서버 재스캔으로 보관함 갱신.
   ─────────────────────────────────────────── */

const ALLOWED_EXTS = [".wav", ".mp3", ".m4a", ".aac", ".ogg", ".flac"];
const ACCEPT = `audio/*,${ALLOWED_EXTS.join(",")}`;

type Status = "ready" | "uploading" | "done" | "error";

interface PendingFile {
  id: string;
  file: File;
  status: Status;
  error?: string;
  /** 서버가 저장한 최종 파일명 (중복 시 " (2)" 접미사) */
  finalName?: string;
}

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
}

export default function UploadTracksModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const addToast = useToastStore((s) => s.addToast);
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<PendingFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);

  const readyCount = items.filter((i) => i.status === "ready").length;
  const doneCount = items.filter((i) => i.status === "done").length;
  const allFinished =
    items.length > 0 && items.every((i) => i.status === "done" || i.status === "error");

  function addFiles(files: FileList | File[]) {
    const next: PendingFile[] = [];
    for (const file of Array.from(files)) {
      // 같은 이름+크기는 이번 선택에서 한 번만
      const dup =
        items.some((i) => i.file.name === file.name && i.file.size === file.size) ||
        next.some((i) => i.file.name === file.name && i.file.size === file.size);
      if (dup) continue;
      const valid = ALLOWED_EXTS.includes(extOf(file.name));
      next.push({
        id: uid(),
        file,
        status: valid ? "ready" : "error",
        error: valid ? undefined : "지원하지 않는 형식",
      });
    }
    if (next.length) setItems((prev) => [...prev, ...next]);
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  function patch(id: string, p: Partial<PendingFile>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...p } : i)));
  }

  async function uploadAll() {
    if (uploading || readyCount === 0) return;
    setUploading(true);
    let success = 0;
    for (const item of items) {
      if (item.status !== "ready") continue;
      patch(item.id, { status: "uploading" });
      try {
        const fd = new FormData();
        fd.append("file", item.file);
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        const data = (await res.json()) as { fileName?: string; error?: string };
        if (!res.ok) throw new Error(data.error || "업로드에 실패했습니다");
        patch(item.id, { status: "done", finalName: data.fileName });
        success++;
      } catch (e) {
        patch(item.id, {
          status: "error",
          error: e instanceof Error ? e.message : "업로드에 실패했습니다",
        });
      }
    }
    setUploading(false);
    if (success > 0) {
      addToast({ type: "success", message: `${success}곡을 보관함에 등록했습니다` });
      router.refresh(); // 서버 재스캔 → TracksProvider 갱신
    }
  }

  function handleClose() {
    if (uploading) return; // 업로드 도중 닫기 방지
    setItems([]);
    setDragOver(false);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="곡 등록"
      footer={
        <div className="flex justify-end gap-2">
          <button
            onClick={handleClose}
            disabled={uploading}
            className="rounded-xl border border-strong bg-surface-primary px-4 py-2.5 text-sm font-medium text-body transition-colors hover:bg-surface-secondary disabled:opacity-50"
          >
            {allFinished ? "닫기" : "취소"}
          </button>
          {!allFinished && (
            <button
              onClick={uploadAll}
              disabled={uploading || readyCount === 0}
              className="flex items-center gap-2 rounded-xl bg-bora-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-bora-700 disabled:opacity-50"
            >
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  등록 중… ({doneCount}/{items.length})
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  {readyCount > 0 ? `${readyCount}곡 등록` : "등록"}
                </>
              )}
            </button>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        {/* 드롭 존 */}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
          }}
          disabled={uploading}
          className={cn(
            "flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors disabled:opacity-50",
            dragOver
              ? "border-bora-400 bg-bora-50"
              : "border-strong bg-surface-secondary/60 hover:border-bora-300 hover:bg-bora-50/50"
          )}
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-bora-50 text-bora-600">
            <Upload className="h-6 w-6" />
          </div>
          <p className="text-sm font-semibold text-heading">
            오디오 파일을 끌어다 놓거나 클릭해서 선택
          </p>
          <p className="text-xs text-caption">
            WAV · MP3 · M4A · AAC · OGG · FLAC — 여러 곡 한 번에 가능
          </p>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="hidden"
          aria-label="오디오 파일 선택"
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files);
            e.target.value = ""; // 같은 파일 재선택 허용
          }}
        />

        {/* 선택된 파일 목록 */}
        {items.length > 0 && (
          <ul className="divide-y divide-surface-2 overflow-hidden rounded-2xl border border-strong">
            {items.map((item) => (
              <li key={item.id} className="flex items-center gap-3 bg-surface-primary px-4 py-3">
                <div
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                    item.status === "error"
                      ? "bg-red-50 text-red-500"
                      : "bg-bora-50 text-bora-600"
                  )}
                >
                  <FileAudio className="h-4.5 w-4.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-heading">
                    {item.finalName ?? item.file.name}
                  </p>
                  <p className="truncate text-xs text-caption">
                    {item.status === "error" ? (
                      <span className="text-red-500">{item.error}</span>
                    ) : (
                      <>
                        {formatBytes(item.file.size)}
                        {item.finalName && item.finalName !== item.file.name &&
                          " · 같은 이름이 있어 새 이름으로 저장"}
                      </>
                    )}
                  </p>
                </div>
                {/* 업로드 시작 후에는 제거 불가 — 순차 루프가 스냅샷을 돌므로
                    제거해도 실제 업로드는 진행되는 불일치를 원천 차단 */}
                {item.status === "ready" && !uploading && (
                  <button
                    onClick={() => removeItem(item.id)}
                    aria-label={`${item.file.name} 제거`}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-caption transition-colors hover:bg-surface-tertiary hover:text-body"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
                {item.status === "uploading" && (
                  <Loader2 className="h-4.5 w-4.5 shrink-0 animate-spin text-bora-500" />
                )}
                {item.status === "done" && (
                  <CheckCircle2 className="h-4.5 w-4.5 shrink-0 text-emerald-500" />
                )}
                {item.status === "error" && (
                  <XCircle className="h-4.5 w-4.5 shrink-0 text-red-500" />
                )}
              </li>
            ))}
          </ul>
        )}

        {items.length === 0 && (
          <p className="flex items-center justify-center gap-1.5 text-xs text-caption">
            <Music2 className="h-3.5 w-3.5" aria-hidden="true" />
            등록한 곡은 .Music 폴더에 원본 그대로 보관됩니다
          </p>
        )}
      </div>
    </Modal>
  );
}
