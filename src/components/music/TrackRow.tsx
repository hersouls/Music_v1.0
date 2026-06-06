"use client";

import { Play, Pause, Heart, FolderInput, Globe, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatTime, formatSampleRate } from "@/lib/format";
import { usePlayerStore } from "@/stores/usePlayerStore";
import TrackArtwork from "@/components/music/TrackArtwork";
import EqBars from "@/components/music/EqBars";
import type { Track } from "@/types/music";

/* ───────────────────────────────────────────
   TrackRow — 목록 공용 트랙 행 (SectionCard p-0 리스트용)
   클릭: 재생 / 현재 곡이면 일시정지 토글
   ─────────────────────────────────────────── */

export default function TrackRow({
  track,
  index,
  contextIds,
  showPlayCount = false,
  showAlbum = true,
  onMove,
  onToggleVisibility,
}: {
  track: Track;
  /** 표시용 순번 (1부터). 생략 시 숨김 */
  index?: number;
  /** 이 목록을 재생 큐 컨텍스트로 사용 */
  contextIds?: string[];
  showPlayCount?: boolean;
  /** 앨범명 표시 — 앨범 그룹 내부에선 중복이라 끔 */
  showAlbum?: boolean;
  /** 지정 시 "앨범으로 이동" 버튼 노출 (보관함 관리) */
  onMove?: (track: Track) => void;
  /** 지정 시 공개/비공개 토글 버튼 노출 (보관함 관리) */
  onToggleVisibility?: (track: Track) => void;
}) {
  const currentId = usePlayerStore((s) => s.currentId);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const isFav = usePlayerStore((s) => s.favorites.includes(track.id));
  const playCount = usePlayerStore((s) => s.playCounts[track.id] ?? 0);
  const playTrack = usePlayerStore((s) => s.playTrack);
  const toggle = usePlayerStore((s) => s.toggle);
  const toggleFavorite = usePlayerStore((s) => s.toggleFavorite);

  const isCurrent = currentId === track.id;
  const playing = isCurrent && isPlaying;
  const isPrivate = track.visibility === "private";

  function handleRowClick() {
    if (isCurrent) toggle();
    else playTrack(track.id, contextIds);
  }

  return (
    <li
      role="button"
      tabIndex={0}
      aria-label={
        isCurrent
          ? `${track.title} ${playing ? "일시정지" : "재생"}`
          : `${track.title} 재생`
      }
      className={cn(
        "group flex cursor-pointer items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-secondary/60 focus-visible:bg-surface-secondary/60 focus-visible:outline-none",
        isCurrent && "bg-bora-50/50"
      )}
      onClick={handleRowClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          handleRowClick();
        }
      }}
      aria-current={isCurrent ? "true" : undefined}
    >
      {index != null && (
        <span className="w-5 shrink-0 text-center text-xs tabular-nums text-caption">
          {playing ? <EqBars className="text-bora-600" /> : index}
        </span>
      )}

      {/* 아트워크 + 호버 재생 오버레이 */}
      <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl shadow-sm">
        <TrackArtwork trackId={track.id} src={track.coverUrl} />
        <span
          className={cn(
            "absolute inset-0 flex items-center justify-center bg-black/35 text-white transition-opacity",
            playing || isCurrent
              ? "opacity-100"
              : "opacity-0 group-hover:opacity-100"
          )}
        >
          {playing ? (
            <Pause className="h-4.5 w-4.5" fill="currentColor" />
          ) : (
            <Play className="h-4.5 w-4.5 translate-x-px" fill="currentColor" />
          )}
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "flex items-center gap-1.5 truncate text-sm font-medium",
            isCurrent ? "text-bora-700" : "text-heading"
          )}
        >
          <span className="truncate">{track.title}</span>
          {isPrivate && !onToggleVisibility && (
            <Lock
              className="h-3 w-3 shrink-0 text-caption"
              aria-label="비공개"
            />
          )}
        </p>
        <p className="truncate text-xs text-caption">
          {track.artist}
          {showAlbum && track.album && ` · ${track.album}`}
          {track.sampleRate > 0 &&
            ` · WAV ${formatSampleRate(track.sampleRate)} ${track.bitsPerSample}bit`}
        </p>
      </div>

      {showPlayCount && playCount > 0 && (
        <span className="hidden shrink-0 text-[11px] tabular-nums text-caption sm:block">
          {playCount}회
        </span>
      )}

      <span className="shrink-0 text-xs tabular-nums text-caption">
        {formatTime(track.duration)}
      </span>

      {onToggleVisibility && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleVisibility(track);
          }}
          aria-label={
            isPrivate ? `${track.title} 공개로 전환` : `${track.title} 비공개로 전환`
          }
          title={isPrivate ? "비공개 — 클릭해서 공개" : "공개 — 클릭해서 비공개"}
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-surface-tertiary",
            isPrivate
              ? "text-amber-500 hover:text-amber-600"
              : "text-caption opacity-0 hover:text-bora-600 focus-visible:opacity-100 group-hover:opacity-100"
          )}
        >
          {isPrivate ? <Lock className="h-4 w-4" /> : <Globe className="h-4 w-4" />}
        </button>
      )}

      {onMove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onMove(track);
          }}
          aria-label={`${track.title} 앨범으로 이동`}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-caption opacity-0 transition-colors hover:bg-surface-tertiary hover:text-bora-600 focus-visible:opacity-100 group-hover:opacity-100"
        >
          <FolderInput className="h-4 w-4" />
        </button>
      )}

      <button
        onClick={(e) => {
          e.stopPropagation();
          toggleFavorite(track.id);
        }}
        aria-label={isFav ? "즐겨찾기 해제" : "즐겨찾기 추가"}
        aria-pressed={isFav}
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-surface-tertiary",
          isFav
            ? "text-rose-500"
            : "text-caption opacity-0 hover:text-rose-500 focus-visible:opacity-100 group-hover:opacity-100"
        )}
      >
        <Heart className="h-4 w-4" fill={isFav ? "currentColor" : "none"} />
      </button>
    </li>
  );
}
