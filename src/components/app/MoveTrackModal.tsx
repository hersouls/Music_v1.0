"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAlbums } from "@/contexts/TracksContext";
import { useToastStore } from "@/stores/useToastStore";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { cn } from "@/lib/utils";
import Modal from "@/components/ui/Modal";
import { Field, fieldInputClass } from "@/components/ui/Form";
import TrackArtwork from "@/components/music/TrackArtwork";
import type { Track } from "@/types/music";
import { FolderInput, Loader2 } from "lucide-react";

/* ───────────────────────────────────────────
   곡 이동 모달 — 트랙을 다른 앨범(폴더)/싱글로 이동
   서버의 id 리맵 쌍으로 즐겨찾기·재생수·큐를 이관해
   이동해도 청취 데이터가 끊기지 않는다.
   ─────────────────────────────────────────── */

const NEW_ALBUM = "__new__";

export default function MoveTrackModal({
  track,
  onClose,
}: {
  track: Track | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const albums = useAlbums();
  const addToast = useToastStore((s) => s.addToast);
  const remapTrackIds = usePlayerStore((s) => s.remapTrackIds);
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
      const res = await fetch("/api/tracks/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: track.id, album: target }),
      });
      const data = (await res.json()) as {
        error?: string;
        album?: string;
        moved?: { oldId: string; newId: string }[];
      };
      if (!res.ok) throw new Error(data.error || "이동에 실패했습니다");
      if (data.moved?.length) remapTrackIds(data.moved);
      addToast({
        type: "success",
        message: data.album
          ? `「${track.title}」을(를) 앨범 「${data.album}」(으)로 이동했습니다`
          : `「${track.title}」을(를) 싱글로 이동했습니다`,
      });
      router.refresh();
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

  return (
    <Modal
      open={!!track}
      onClose={handleClose}
      title="앨범으로 이동"
      footer={
        <div className="flex justify-end gap-2">
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
      }
    >
      {track && (
        <div className="space-y-4">
          {/* 이동할 곡 */}
          <div className="flex items-center gap-3 rounded-2xl border border-strong bg-surface-secondary/60 px-4 py-3">
            <span className="h-10 w-10 shrink-0 overflow-hidden rounded-xl">
              <TrackArtwork trackId={track.id} />
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
            파일이 해당 폴더로 옮겨지며, 즐겨찾기·재생 기록은 그대로 유지돼요.
          </p>
        </div>
      )}
    </Modal>
  );
}
