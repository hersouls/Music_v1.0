"use client";

import { useEffect, useState } from "react";
import { useTracks } from "@/contexts/TracksContext";
import { useToastStore } from "@/stores/useToastStore";
import { renameAlbum } from "@/lib/firestore-tracks";
import { cn } from "@/lib/utils";
import Modal from "@/components/ui/Modal";
import { Field, fieldInputClass } from "@/components/ui/Form";
import { Pencil, Loader2 } from "lucide-react";

/* ───────────────────────────────────────────
   앨범 이름 변경 모달 — 해당 앨범의 내 곡 album 필드 일괄 갱신
   (문서 id 불변 → 즐겨찾기·재생수·재생 중 곡 모두 그대로)
   새 앨범은 곡 등록/이동에서 이름 입력으로 생성된다.
   ─────────────────────────────────────────── */

export type AlbumNameModalState = { mode: "rename"; name: string };

export default function AlbumNameModal({
  state,
  onClose,
}: {
  state: AlbumNameModalState | null;
  onClose: () => void;
}) {
  const tracks = useTracks();
  const addToast = useToastStore((s) => s.addToast);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const open = state !== null;

  useEffect(() => {
    if (state) setName(state.name);
  }, [state]);

  function handleClose() {
    if (busy) return;
    onClose();
  }

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed || busy || !state) return;
    if (trimmed === state.name) {
      onClose();
      return;
    }
    setBusy(true);
    try {
      await renameAlbum(tracks, state.name, trimmed);
      addToast({
        type: "success",
        message: `앨범 이름을 「${trimmed}」(으)로 변경했습니다`,
      });
      onClose();
    } catch (e) {
      addToast({
        type: "error",
        message: e instanceof Error ? e.message : "요청에 실패했습니다",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="앨범 이름 변경"
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
            disabled={busy || !name.trim()}
            className="flex items-center gap-2 rounded-xl bg-bora-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-bora-700 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Pencil className="h-4 w-4" />
            )}
            변경
          </button>
        </div>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field
          label="앨범 이름"
          hint="앨범 안의 곡과 청취 기록은 그대로 유지돼요"
          required
        >
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
            placeholder="예: 달빛 파도"
            aria-label="앨범 이름"
            autoFocus
            className={cn(fieldInputClass)}
          />
        </Field>
      </form>
    </Modal>
  );
}
