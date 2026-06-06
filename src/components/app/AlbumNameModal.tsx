"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useToastStore } from "@/stores/useToastStore";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { cn } from "@/lib/utils";
import Modal from "@/components/ui/Modal";
import { Field, fieldInputClass } from "@/components/ui/Form";
import { FolderPlus, Pencil, Loader2 } from "lucide-react";

/* ───────────────────────────────────────────
   앨범 이름 모달 — 새 앨범 만들기 / 이름 변경 공용
   이름 변경 시 서버가 돌려주는 id 리맵 쌍으로
   즐겨찾기·재생수 등 청취 데이터를 새 id 로 이관.
   ─────────────────────────────────────────── */

export type AlbumNameModalState =
  | { mode: "create" }
  | { mode: "rename"; name: string };

export default function AlbumNameModal({
  state,
  onClose,
}: {
  state: AlbumNameModalState | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const addToast = useToastStore((s) => s.addToast);
  const remapTrackIds = usePlayerStore((s) => s.remapTrackIds);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const open = state !== null;
  const isRename = state?.mode === "rename";

  useEffect(() => {
    if (state) setName(state.mode === "rename" ? state.name : "");
  }, [state]);

  function handleClose() {
    if (busy) return;
    onClose();
  }

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed || busy || !state) return;
    if (isRename && trimmed === state.name) {
      onClose();
      return;
    }
    setBusy(true);
    try {
      const res = isRename
        ? await fetch("/api/albums", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ from: state.name, to: trimmed }),
          })
        : await fetch("/api/albums", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: trimmed }),
          });
      const data = (await res.json()) as {
        name?: string;
        error?: string;
        moved?: { oldId: string; newId: string }[];
      };
      if (!res.ok) throw new Error(data.error || "요청에 실패했습니다");
      if (data.moved?.length) remapTrackIds(data.moved);
      addToast({
        type: "success",
        message: isRename
          ? `앨범 이름을 「${data.name}」(으)로 변경했습니다`
          : `앨범 「${data.name}」을(를) 만들었습니다`,
      });
      router.refresh();
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
      title={isRename ? "앨범 이름 변경" : "새 앨범 만들기"}
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
            ) : isRename ? (
              <Pencil className="h-4 w-4" />
            ) : (
              <FolderPlus className="h-4 w-4" />
            )}
            {isRename ? "변경" : "만들기"}
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
          hint={
            isRename
              ? "폴더 이름이 함께 바뀌며, 안의 곡과 청취 기록은 그대로 유지돼요"
              : ".Music 아래에 같은 이름의 폴더가 만들어져요"
          }
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
