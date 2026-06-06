"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useTracks, useAlbums } from "@/contexts/TracksContext";
import { useToastStore } from "@/stores/useToastStore";
import { setTracksAlbum } from "@/lib/firestore-tracks";
import { formatDurationKo, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import Modal from "@/components/ui/Modal";
import { Field, fieldInputClass } from "@/components/ui/Form";
import TrackArtwork from "@/components/music/TrackArtwork";
import type { Track } from "@/types/music";
import {
  Check,
  Disc3,
  FolderPlus,
  Loader2,
  Music2,
  Search,
} from "lucide-react";

/* ───────────────────────────────────────────
   새 앨범 만들기 모달 — 이름 짓고 보관함에서 곡을 골라 담는다.
   앨범 = tracks.album 문자열 그룹이므로 선택한 곡의 album 필드만
   batch 갱신 (문서 id 불변 → 즐겨찾기·재생수·재생 중 곡 그대로).
   커버 모자이크가 선택에 따라 실시간으로 조립되는 라이브 프리뷰.
   ─────────────────────────────────────────── */

const spring = { type: "spring", stiffness: 480, damping: 34 } as const;

export default function CreateAlbumModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const tracks = useTracks();
  const albums = useAlbums();
  const addToast = useToastStore((s) => s.addToast);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);

  /* 열릴 때마다 초기화 */
  useEffect(() => {
    if (open) {
      setName("");
      setSelected(new Set());
      setQuery("");
    }
  }, [open]);

  const trimmed = name.trim();
  const isExisting = albums.includes(trimmed);

  /* 피커 목록 — 보관함 정렬(싱글 먼저) 그대로, 검색 필터만 적용 */
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tracks;
    return tracks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.fileName.toLowerCase().includes(q) ||
        t.album.toLowerCase().includes(q)
    );
  }, [tracks, query]);

  const selectedTracks = useMemo(
    () => tracks.filter((t) => selected.has(t.id)),
    [tracks, selected]
  );
  const totalSec = useMemo(
    () => selectedTracks.reduce((s, t) => s + t.duration, 0),
    [selectedTracks]
  );

  const allVisibleSelected =
    visible.length > 0 && visible.every((t) => selected.has(t.id));

  function toggleTrack(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) for (const t of visible) next.delete(t.id);
      else for (const t of visible) next.add(t.id);
      return next;
    });
  }

  function handleClose() {
    if (busy) return;
    onClose();
  }

  async function submit() {
    if (!trimmed || selected.size === 0 || busy) return;
    setBusy(true);
    try {
      const count = await setTracksAlbum([...selected], trimmed);
      addToast({
        type: "success",
        message: isExisting
          ? `「${trimmed}」 앨범에 ${count}곡을 담았습니다`
          : `새 앨범 「${trimmed}」을(를) 만들었습니다 — ${count}곡`,
      });
      onClose();
    } catch (e) {
      addToast({
        type: "error",
        message: e instanceof Error ? e.message : "앨범 만들기에 실패했습니다",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="새 앨범 만들기"
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 truncate text-xs text-caption" aria-live="polite">
            {selected.size > 0
              ? `${selected.size}곡 선택 · ${formatDurationKo(totalSec)}`
              : "담을 곡을 1곡 이상 선택하세요"}
          </p>
          <div className="flex shrink-0 gap-2">
            <button
              onClick={handleClose}
              disabled={busy}
              className="rounded-xl border border-strong bg-surface-primary px-4 py-2.5 text-sm font-medium text-body transition-colors hover:bg-surface-secondary disabled:opacity-50"
            >
              취소
            </button>
            <button
              onClick={submit}
              disabled={busy || !trimmed || selected.size === 0}
              className="flex items-center gap-2 rounded-xl bg-bora-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-bora-700 disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FolderPlus className="h-4 w-4" />
              )}
              {isExisting ? "앨범에 담기" : "앨범 만들기"}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* 라이브 프리뷰 — 선택한 곡으로 커버 모자이크가 조립된다 */}
        <div className="flex items-center gap-4 rounded-2xl border border-strong bg-surface-secondary/60 p-4">
          <CoverMosaic tracks={selectedTracks} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-bold text-heading">
              {trimmed || "이름 없는 앨범"}
            </p>
            <p className="mt-0.5 text-xs text-caption">
              {selected.size > 0
                ? `${selected.size}곡 · ${formatDurationKo(totalSec)}`
                : "아래에서 담을 곡을 골라주세요"}
            </p>
            {isExisting && (
              <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                <Disc3 className="h-3 w-3" aria-hidden="true" />
                이미 있는 앨범 — 선택한 곡이 추가돼요
              </span>
            )}
          </div>
        </div>

        {/* 앨범 이름 */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Field label="앨범 이름" required>
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

        {/* 곡 선택 피커 */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="block text-sm font-medium text-heading">
              담을 곡<span className="ml-0.5 text-red-500">*</span>
            </label>
            {visible.length > 0 && (
              <button
                type="button"
                onClick={toggleAllVisible}
                disabled={busy}
                className="rounded-lg px-2 py-1 text-xs font-medium text-bora-600 transition-colors hover:bg-bora-50 hover:text-bora-700 disabled:opacity-50"
              >
                {allVisibleSelected
                  ? "전체 해제"
                  : `전체 선택 (${visible.length})`}
              </button>
            )}
          </div>

          <div className="overflow-hidden rounded-2xl border border-strong">
            {/* 피커 내 검색 */}
            <div className="flex items-center gap-2 border-b border-base px-3.5">
              <Search className="h-3.5 w-3.5 shrink-0 text-caption" aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                disabled={busy}
                placeholder="곡 검색 (제목 · 앨범 · 파일명)"
                aria-label="담을 곡 검색"
                className="w-full bg-transparent py-2.5 text-sm text-heading placeholder:text-caption outline-none disabled:opacity-50"
              />
            </div>

            {tracks.length === 0 ? (
              <PickerEmpty
                icon={Music2}
                text="보관함이 비어 있어요 — 곡을 먼저 등록해 주세요"
              />
            ) : visible.length === 0 ? (
              <PickerEmpty
                icon={Search}
                text={`“${query.trim()}” 와 일치하는 곡이 없어요`}
              />
            ) : (
              <ul className="max-h-60 divide-y divide-surface-2 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
                {visible.map((t) => (
                  <PickerRow
                    key={t.id}
                    track={t}
                    checked={selected.has(t.id)}
                    disabled={busy}
                    onToggle={() => toggleTrack(t.id)}
                  />
                ))}
              </ul>
            )}
          </div>
          <p className="mt-1 text-xs text-caption">
            다른 앨범에 있던 곡은 이 앨범으로 이동해요 · 즐겨찾기·재생 기록은 그대로
          </p>
        </div>
      </div>
    </Modal>
  );
}

/* 커버 모자이크 — 선택 곡 아트워크로 1·2·3·4분할 라이브 조립 */
function CoverMosaic({ tracks }: { tracks: Track[] }) {
  const arts = tracks.slice(0, 4);
  const extra = tracks.length - arts.length;

  return (
    <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl shadow-md ring-1 ring-black/5">
      {arts.length === 0 ? (
        <div className="flex h-full w-full items-center justify-center rounded-2xl border-2 border-dashed border-strong bg-surface-secondary">
          <Disc3 className="h-8 w-8 text-caption/70" aria-hidden="true" />
        </div>
      ) : (
        <div className="grid h-full w-full grid-cols-2 grid-rows-2">
          {arts.map((t, i) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, scale: 1.2 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={spring}
              className={cn(
                "overflow-hidden",
                arts.length === 1 && "col-span-2 row-span-2",
                arts.length === 2 && "row-span-2",
                arts.length === 3 && i === 0 && "row-span-2"
              )}
            >
              <TrackArtwork trackId={t.id} src={t.coverUrl} />
            </motion.div>
          ))}
        </div>
      )}
      {extra > 0 && (
        <span className="absolute bottom-1 right-1 rounded-full bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
          +{extra}
        </span>
      )}
    </div>
  );
}

/* 피커 행 — 클릭으로 토글, 체크가 스프링으로 튀어나온다 */
function PickerRow({
  track,
  checked,
  disabled,
  onToggle,
}: {
  track: Track;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        aria-pressed={checked}
        className={cn(
          "flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors disabled:opacity-50",
          checked ? "bg-bora-50/60" : "hover:bg-surface-secondary/60"
        )}
      >
        <span
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors",
            checked
              ? "border-bora-600 bg-bora-600 text-white"
              : "border-strong bg-surface-primary text-transparent"
          )}
          aria-hidden="true"
        >
          <motion.span
            initial={false}
            animate={{ scale: checked ? 1 : 0 }}
            transition={spring}
            className="flex"
          >
            <Check className="h-3 w-3" strokeWidth={3} />
          </motion.span>
        </span>

        <span className="h-9 w-9 shrink-0 overflow-hidden rounded-lg shadow-sm">
          <TrackArtwork trackId={track.id} src={track.coverUrl} />
        </span>

        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "block truncate text-sm font-medium",
              checked ? "text-bora-700" : "text-heading"
            )}
          >
            {track.title}
          </span>
          <span className="block truncate text-xs text-caption">
            {track.album || "싱글"}
          </span>
        </span>

        <span className="shrink-0 text-xs tabular-nums text-caption">
          {formatTime(track.duration)}
        </span>
      </button>
    </li>
  );
}

/* 피커 빈 상태 */
function PickerEmpty({
  icon: Icon,
  text,
}: {
  icon: typeof Music2;
  text: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <Icon className="h-5 w-5 text-caption/70" aria-hidden="true" />
      <p className="text-sm text-caption">{text}</p>
    </div>
  );
}
