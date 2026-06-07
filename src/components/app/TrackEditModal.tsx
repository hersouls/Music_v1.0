"use client";

import { useEffect, useState } from "react";
import { useAlbums } from "@/contexts/TracksContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToastStore } from "@/stores/useToastStore";
import { useDialogStore } from "@/stores/useDialogStore";
import {
  updateTrackMeta,
  deleteTrack,
  saveTrackCover,
  clearTrackCover,
} from "@/lib/firestore-tracks";
import { requestCoverArt } from "@/lib/ai-client";
import { canDownload, downloadTrackCover } from "@/lib/download";
import { cn } from "@/lib/utils";
import Modal from "@/components/ui/Modal";
import { Field, fieldInputClass } from "@/components/ui/Form";
import TrackArtwork from "@/components/music/TrackArtwork";
import type { Track, Visibility } from "@/types/music";
import {
  Check,
  Globe,
  Loader2,
  Lock,
  Palette,
  RefreshCw,
  Trash2,
  X,
  ImageDown,
} from "lucide-react";

/* ───────────────────────────────────────────
   곡 수정 모달 — 제목·아티스트·앨범·공개·커버 편집 + 삭제 (소유자)
   메타는 단일 updateDoc 저장. 커버(AI 재생성·제거)는 즉시 반영(독립).
   앨범 = 문자열 그룹이라 문서 id 불변 → 청취 데이터 유지.
   ─────────────────────────────────────────── */

const NEW_ALBUM = "__new__";

export default function TrackEditModal({
  track,
  onClose,
}: {
  track: Track | null;
  onClose: () => void;
}) {
  const albums = useAlbums();
  const { uid, user } = useAuth();
  const allowDownload = canDownload(user?.email);
  const addToast = useToastStore((s) => s.addToast);
  const openDialog = useDialogStore((s) => s.openDialog);

  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [choice, setChoice] = useState("");
  const [newAlbum, setNewAlbum] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("public");
  const [busy, setBusy] = useState(false);
  const [coverBusy, setCoverBusy] = useState(false);
  /** 커버 즉시 반영 미리보기 (구독 갱신 전 잠깐 사용) */
  const [coverOverride, setCoverOverride] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (!track) return;
    setTitle(track.title);
    setArtist(track.artist);
    setChoice(track.album || "");
    setNewAlbum("");
    setVisibility(track.visibility);
    setCoverOverride(undefined);
  }, [track]);

  if (!track) return null;
  const t = track;

  const album = choice === NEW_ALBUM ? newAlbum.trim() : choice;
  const dirty =
    title.trim() !== t.title ||
    artist.trim() !== t.artist ||
    album !== t.album ||
    visibility !== t.visibility;
  const canSave =
    !busy &&
    title.trim().length > 0 &&
    (choice !== NEW_ALBUM || newAlbum.trim().length > 0) &&
    dirty;

  const coverUrl = coverOverride === undefined ? t.coverUrl : coverOverride;

  function handleClose() {
    if (busy || coverBusy) return;
    onClose();
  }

  async function save() {
    if (!canSave) return;
    setBusy(true);
    try {
      await updateTrackMeta(t.id, {
        title: title.trim(),
        // 비우면 업로더 이름으로 — 빈 문자열은 폴백되지 않으므로 직접 대입
        artist: artist.trim() || t.ownerName,
        album,
        visibility,
      });
      addToast({ type: "success", message: "곡 정보를 수정했습니다" });
      onClose();
    } catch (e) {
      addToast({
        type: "error",
        message: e instanceof Error ? e.message : "수정에 실패했습니다",
      });
    } finally {
      setBusy(false);
    }
  }

  async function regenerateCover() {
    if (coverBusy || !uid) return;
    setCoverBusy(true);
    addToast({ type: "info", message: "AI 커버를 그리고 있어요…" });
    try {
      const blob = await requestCoverArt({
        title: title.trim() || t.title,
        album: album || undefined,
        lyrics: t.lyrics || undefined,
      });
      const url = await saveTrackCover(uid, t.id, blob);
      setCoverOverride(url);
      addToast({ type: "success", message: "커버를 새로 만들었어요" });
    } catch (e) {
      addToast({
        type: "error",
        message: e instanceof Error ? e.message : "커버 생성에 실패했어요",
      });
    } finally {
      setCoverBusy(false);
    }
  }

  async function removeCover() {
    if (coverBusy) return;
    setCoverBusy(true);
    try {
      await clearTrackCover(t);
      setCoverOverride(null);
      addToast({ type: "success", message: "커버를 제거했어요 (기본 아트로 표시)" });
    } catch {
      addToast({ type: "error", message: "커버 제거에 실패했어요" });
    } finally {
      setCoverBusy(false);
    }
  }

  function confirmDelete() {
    if (busy) return;
    openDialog({
      title: "곡 삭제",
      description: `「${t.title}」을(를) 완전히 삭제합니다. 클라우드의 원본·커버 파일도 함께 지워지며 되돌릴 수 없어요.`,
      confirmLabel: "삭제",
      variant: "danger",
      onConfirm: async () => {
        try {
          await deleteTrack(t);
          addToast({ type: "success", message: `「${t.title}」을(를) 삭제했습니다` });
          onClose();
        } catch {
          addToast({ type: "error", message: "삭제에 실패했습니다" });
          throw new Error("delete-failed");
        }
      },
    });
  }

  return (
    <Modal
      open={!!track}
      onClose={handleClose}
      title="곡 수정"
      footer={
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={confirmDelete}
            disabled={busy || coverBusy}
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" /> 곡 삭제
          </button>
          <div className="flex gap-2">
            <button
              onClick={handleClose}
              disabled={busy || coverBusy}
              className="rounded-xl border border-strong bg-surface-primary px-4 py-2.5 text-sm font-medium text-body transition-colors hover:bg-surface-secondary disabled:opacity-50"
            >
              취소
            </button>
            <button
              onClick={save}
              disabled={!canSave}
              className="flex items-center gap-2 rounded-xl bg-bora-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-bora-700 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              저장
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* 커버 */}
        <div className="flex items-center gap-4">
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl shadow-md ring-1 ring-black/5">
            <TrackArtwork trackId={t.id} src={coverUrl} />
            {coverBusy && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                <Loader2 className="h-5 w-5 animate-spin text-white" />
              </div>
            )}
          </div>
          <div className="flex flex-1 flex-wrap gap-2">
            <button
              onClick={regenerateCover}
              disabled={coverBusy}
              className="inline-flex items-center gap-1.5 rounded-xl border border-bora-200 bg-bora-50 px-3 py-2 text-xs font-semibold text-bora-700 transition-colors hover:bg-bora-100 disabled:opacity-50"
            >
              {coverBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : coverUrl ? <RefreshCw className="h-3.5 w-3.5" /> : <Palette className="h-3.5 w-3.5" />}
              {coverUrl ? "AI 커버 다시" : "AI 커버 만들기"}
            </button>
            {coverUrl && allowDownload && (
              <button
                onClick={() => void downloadTrackCover({ ...t, coverUrl })}
                disabled={coverBusy}
                className="inline-flex items-center gap-1.5 rounded-xl border border-strong bg-surface-primary px-3 py-2 text-xs font-medium text-body transition-colors hover:bg-surface-secondary disabled:opacity-50"
              >
                <ImageDown className="h-3.5 w-3.5" /> 커버 다운로드
              </button>
            )}
            {coverUrl && (
              <button
                onClick={removeCover}
                disabled={coverBusy}
                className="inline-flex items-center gap-1.5 rounded-xl border border-strong bg-surface-primary px-3 py-2 text-xs font-medium text-body transition-colors hover:bg-surface-secondary disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" /> 커버 제거
              </button>
            )}
          </div>
        </div>

        <Field label="제목" required>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={busy}
            aria-label="곡 제목"
            className={cn(fieldInputClass)}
          />
        </Field>

        <Field label="아티스트">
          <input
            type="text"
            value={artist}
            onChange={(e) => setArtist(e.target.value)}
            disabled={busy}
            placeholder="비우면 업로더 이름"
            aria-label="아티스트"
            className={cn(fieldInputClass)}
          />
        </Field>

        <Field label="앨범">
          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              value={choice}
              onChange={(e) => setChoice(e.target.value)}
              disabled={busy}
              aria-label="앨범 선택"
              className={cn(fieldInputClass, "sm:flex-1")}
            >
              <option value="">싱글 (앨범 없음)</option>
              {albums.map((a) => (
                <option key={a} value={a}>
                  {a}
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

        <Field label="공개 설정">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setVisibility("public")}
              aria-pressed={visibility === "public"}
              className={cn(
                "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left transition-all",
                visibility === "public"
                  ? "border-bora-300 bg-bora-50 ring-1 ring-bora-300"
                  : "border-strong bg-surface-primary hover:bg-surface-secondary"
              )}
            >
              <Globe className={cn("h-4 w-4 shrink-0", visibility === "public" ? "text-bora-600" : "text-caption")} />
              <span className="min-w-0">
                <span className={cn("block text-sm font-semibold", visibility === "public" ? "text-bora-700" : "text-heading")}>공개</span>
                <span className="block truncate text-[11px] text-caption">둘러보기에 노출</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => setVisibility("private")}
              aria-pressed={visibility === "private"}
              className={cn(
                "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left transition-all",
                visibility === "private"
                  ? "border-amber-300 bg-amber-50 ring-1 ring-amber-300"
                  : "border-strong bg-surface-primary hover:bg-surface-secondary"
              )}
            >
              <Lock className={cn("h-4 w-4 shrink-0", visibility === "private" ? "text-amber-600" : "text-caption")} />
              <span className="min-w-0">
                <span className={cn("block text-sm font-semibold", visibility === "private" ? "text-amber-700" : "text-heading")}>비공개</span>
                <span className="block truncate text-[11px] text-caption">나만 듣기</span>
              </span>
            </button>
          </div>
        </Field>

        <p className="text-xs text-caption">
          앨범·공개를 바꿔도 즐겨찾기·재생 기록·가사는 그대로 유지돼요.
        </p>
      </div>
    </Modal>
  );
}
