"use client";

import { useRef, useState } from "react";
import { useAlbums } from "@/contexts/TracksContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToastStore } from "@/stores/useToastStore";
import { uploadTrack, extOf, type UploadPhase } from "@/lib/upload";
import { formatBytes } from "@/lib/format";
import { uid as makeUid, cn } from "@/lib/utils";
import Modal from "@/components/ui/Modal";
import { Field, fieldInputClass } from "@/components/ui/Form";
import type { Visibility } from "@/types/music";
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
   클라이언트에서 직접 Firebase 에 업로드.
   WAV/FLAC 은 ffmpeg.wasm 으로 192k mp3 동시 생성(스트리밍용),
   원본은 그대로 보관. 완료 즉시 Firestore 구독으로 보관함 갱신.
   ─────────────────────────────────────────── */

const ALLOWED_EXTS = [".wav", ".mp3", ".m4a", ".aac", ".ogg", ".flac"];
const ACCEPT = `audio/*,${ALLOWED_EXTS.join(",")}`;

type Status = "ready" | "working" | "done" | "error";

interface PendingFile {
  id: string;
  file: File;
  status: Status;
  error?: string;
  /** 진행 단계 라벨 (변환 중 / 업로드 중 …) */
  phaseLabel?: string;
  /** 0~100 진행률 (변환·업로드) */
  pct?: number;
}

const PHASE_LABEL: Record<UploadPhase, string> = {
  probe: "분석 중",
  convert: "mp3 변환 중",
  upload: "업로드 중",
  finalize: "마무리 중",
};

export default function UploadTracksModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { uid, user } = useAuth();
  const addToast = useToastStore((s) => s.addToast);
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<PendingFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);

  /* 앨범 선택 — 내 곡에서 파생된 앨범 목록 + 새 앨범 ("" = 싱글) */
  const NEW_ALBUM = "__new__";
  const [albumChoice, setAlbumChoice] = useState("");
  const [newAlbum, setNewAlbum] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("public");
  const existingAlbums = useAlbums();
  const effectiveAlbum =
    albumChoice === NEW_ALBUM ? newAlbum.trim() : albumChoice;

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
        id: makeUid(),
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
    if (uploading || readyCount === 0 || !uid) return;
    setUploading(true);
    const ownerName =
      user?.displayName || user?.email?.split("@")[0] || "Moonwave";
    let success = 0;
    for (const item of items) {
      if (item.status !== "ready") continue;
      patch(item.id, { status: "working", phaseLabel: "분석 중", pct: 0 });
      try {
        await uploadTrack(
          {
            file: item.file,
            album: effectiveAlbum,
            visibility,
            uid,
            ownerName,
          },
          {
            onProgress: (phase, ratio) =>
              patch(item.id, {
                phaseLabel: PHASE_LABEL[phase],
                pct: Math.round(ratio * 100),
              }),
          }
        );
        patch(item.id, { status: "done", phaseLabel: undefined, pct: undefined });
        success++;
      } catch (e) {
        patch(item.id, {
          status: "error",
          phaseLabel: undefined,
          pct: undefined,
          error: e instanceof Error ? e.message : "업로드에 실패했습니다",
        });
      }
    }
    setUploading(false);
    if (success > 0) {
      addToast({ type: "success", message: `${success}곡을 보관함에 등록했습니다` });
    }
  }

  function handleClose() {
    if (uploading) return; // 업로드 도중 닫기 방지
    setItems([]);
    setDragOver(false);
    setAlbumChoice("");
    setNewAlbum("");
    setVisibility("public");
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
              disabled={
                uploading ||
                readyCount === 0 ||
                (albumChoice === NEW_ALBUM && !newAlbum.trim())
              }
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
        {/* 앨범 + 공개 설정 */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="앨범">
            <div className="flex flex-col gap-2">
              <select
                value={albumChoice}
                onChange={(e) => setAlbumChoice(e.target.value)}
                disabled={uploading || allFinished}
                aria-label="앨범 선택"
                className={cn(fieldInputClass)}
              >
                <option value="">싱글 (앨범 없음)</option>
                {existingAlbums.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
                <option value={NEW_ALBUM}>＋ 새 앨범 만들기</option>
              </select>
              {albumChoice === NEW_ALBUM && (
                <input
                  type="text"
                  value={newAlbum}
                  onChange={(e) => setNewAlbum(e.target.value)}
                  disabled={uploading || allFinished}
                  placeholder="새 앨범 이름"
                  aria-label="새 앨범 이름"
                  autoFocus
                  className={cn(fieldInputClass)}
                />
              )}
            </div>
          </Field>
          <Field
            label="공개 설정"
            hint={visibility === "public" ? "둘러보기에서 모두가 들을 수 있어요" : "나만 들을 수 있어요"}
          >
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as Visibility)}
              disabled={uploading || allFinished}
              aria-label="공개 설정"
              className={cn(fieldInputClass)}
            >
              <option value="public">공개</option>
              <option value="private">비공개</option>
            </select>
          </Field>
        </div>

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
              <li key={item.id} className="bg-surface-primary px-4 py-3">
                <div className="flex items-center gap-3">
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
                      {item.file.name}
                    </p>
                    <p className="truncate text-xs text-caption">
                      {item.status === "error" ? (
                        <span className="text-red-500">{item.error}</span>
                      ) : item.status === "working" ? (
                        <>
                          {item.phaseLabel}
                          {item.pct != null && item.pct > 0 && ` ${item.pct}%`}
                        </>
                      ) : (
                        formatBytes(item.file.size)
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
                  {item.status === "working" && (
                    <Loader2 className="h-4.5 w-4.5 shrink-0 animate-spin text-bora-500" />
                  )}
                  {item.status === "done" && (
                    <CheckCircle2 className="h-4.5 w-4.5 shrink-0 text-emerald-500" />
                  )}
                  {item.status === "error" && (
                    <XCircle className="h-4.5 w-4.5 shrink-0 text-red-500" />
                  )}
                </div>
                {/* 진행 바 */}
                {item.status === "working" && item.pct != null && (
                  <div className="ml-12 mt-2 h-1 overflow-hidden rounded-full bg-surface-secondary">
                    <div
                      className="h-full rounded-full bg-bora-500 transition-[width] duration-300"
                      style={{ width: `${item.pct}%` }}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {items.length === 0 && (
          <p className="flex items-center justify-center gap-1.5 text-xs text-caption">
            <Music2 className="h-3.5 w-3.5" aria-hidden="true" />
            원본은 클라우드에 그대로 보관되고, WAV 는 스트리밍용 mp3 가 함께 만들어져요
          </p>
        )}
      </div>
    </Modal>
  );
}
