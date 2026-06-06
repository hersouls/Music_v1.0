"use client";

import { useEffect, useState } from "react";
import { useAlbums } from "@/contexts/TracksContext";
import { useToastStore } from "@/stores/useToastStore";
import { useDialogStore } from "@/stores/useDialogStore";
import { moveTrack as moveTrackDoc, deleteTrack } from "@/lib/firestore-tracks";
import { cn } from "@/lib/utils";
import Modal from "@/components/ui/Modal";
import { Field, fieldInputClass } from "@/components/ui/Form";
import TrackArtwork from "@/components/music/TrackArtwork";
import type { Track } from "@/types/music";
import { FolderInput, Loader2, Trash2 } from "lucide-react";

/* ───────────────────────────────────────────
   곡 이동 모달 — 트랙을 다른 앨범/싱글로 이동 (album 필드 갱신)
   문서 id 가 불변이라 즐겨찾기·재생수·재생 중 곡이 그대로 유지된다.
   + 곡 삭제 (Firestore 문서 + Storage 원본·스트림)
   ─────────────────────────────────────────── */

const NEW_ALBUM = "__new__";

export default function MoveTrackModal({
  track,
  onClose,
}: {
  track: Track | null;
  onClose: () => void;
}) {
  const albums = useAlbums();
  const addToast = useToastStore((s) => s.addToast);
  const openDialog = useDialogStore((s) => s.openDialog);
  const [choice, setChoice] = useState("");
  const [newAlbum, setNewAlbum] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (track) {
      setChoice(track.album === "" ? (albums[0] ?? NEW_ALBUM) : "");
      setNewAlbum("");
    }
    // 모달이 열릴 때만 초기화 — albums 변경으로 재초기화하지 않음
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track]);

  const target = choice === NEW_ALBUM ? newAlbum.trim() : choice;
  const isNoop = !!track && target === track.album;

  function handleClose() {
    if (busy) return;
    onClose();
  }

  async function submit() {
    if (!track || busy || isNoop || (choice === NEW_ALBUM && !newAlbum.trim()))
      return;
    setBusy(true);
    try {
      await moveTrackDoc(track.id, target);
      addToast({
        type: "success",
        message: target
          ? `「${track.title}」을(를) 앨범 「${target}」(으)로 이동했습니다`
          : `「${track.title}」을(를) 싱글로 이동했습니다`,
      });
      onClose();
    } catch (e) {
      addToast({
        type: "error",
        message: e instanceof Error ? e.message : "이동에 실패했습니다",
      });
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete() {
    if (!track || busy) return;
    const t = track;
    openDialog({
      title: "곡 삭제",
      description: `「${t.title}」을(를) 완전히 삭제합니다. 클라우드의 원본 파일도 함께 지워지며 되돌릴 수 없어요.`,
      confirmLabel: "삭제",
      variant: "danger",
      onConfirm: async () => {
        try {
          await deleteTrack(t);
          addToast({ type: "success", message: `「${t.title}」을(를) 삭제했습니다` });
          onClose();
        } catch {
          addToast({ type: "error", message: "삭제에 실패했습니다" });
          throw new Error("delete-failed"); // 다이얼로그 유지
        }
      },
    });
  }

  return (
    <Modal
      open={!!track}
      onClose={handleClose}
      title="곡 관리"
      footer={
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={confirmDelete}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" /> 곡 삭제
          </button>
          <div className="flex gap-2">
            <button
              onClick={handleClose}
              disabled={busy}
              className="rounded-xl border border-strong bg-surface-primary px-4 py-2.5 text-sm font-medium text-body transition-colors hover:bg-surface-secondary disabled:opacity-50"
            >
              취소
            </button>
            <button
              onClick={submit}
              disabled={
                busy || isNoop || (choice === NEW_ALBUM && !newAlbum.trim())
              }
              className="flex items-center gap-2 rounded-xl bg-bora-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-bora-700 disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FolderInput className="h-4 w-4" />
              )}
              이동
            </button>
          </div>
        </div>
      }
    >
      {track && (
        <div className="space-y-4">
          {/* 이동할 곡 */}
          <div className="flex items-center gap-3 rounded-2xl border border-strong bg-surface-secondary/60 px-4 py-3">
            <span className="h-10 w-10 shrink-0 overflow-hidden rounded-xl">
              <TrackArtwork trackId={track.id} src={track.coverUrl} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-heading">
                {track.title}
              </p>
              <p className="truncate text-xs text-caption">
                현재 위치: {track.album || "싱글"}
              </p>
            </div>
          </div>

          <Field label="이동할 앨범" required>
            <div className="flex flex-col gap-2 sm:flex-row">
              <select
                value={choice}
                onChange={(e) => setChoice(e.target.value)}
                disabled={busy}
                aria-label="이동할 앨범 선택"
                className={cn(fieldInputClass, "sm:flex-1")}
              >
                <option value="" disabled={track.album === ""}>
                  싱글 (앨범 없음){track.album === "" ? " — 현재 위치" : ""}
                </option>
                {albums.map((a) => (
                  <option key={a} value={a} disabled={a === track.album}>
                    {a}
                    {a === track.album ? " — 현재 위치" : ""}
                  </option>
                ))}
                <option value={NEW_ALBUM}>＋ 새 앨범 만들기</option>
              </select>
              {choice === NEW_ALBUM && (
                <input
                  type="text"
                  value={newAlbum}
                  onChange={(e) => setNewAlbum(e.target.value)}
                  disabled={busy}
                  placeholder="새 앨범 이름"
                  aria-label="새 앨범 이름"
                  autoFocus
                  className={cn(fieldInputClass, "sm:flex-1")}
                />
              )}
            </div>
          </Field>

          <p className="text-xs text-caption">
            앨범 필드만 바뀌므로 즐겨찾기·재생 기록·재생 중인 곡 모두 그대로예요.
          </p>
        </div>
      )}
    </Modal>
  );
}
