"use client";

import { Play, Pause, Heart } from "lucide-react";
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
}: {
  track: Track;
  /** 표시용 순번 (1부터). 생략 시 숨김 */
  index?: number;
  /** 이 목록을 재생 큐 컨텍스트로 사용 */
  contextIds?: string[];
  showPlayCount?: boolean;
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
        <TrackArtwork trackId={track.id} />
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
            "truncate text-sm font-medium",
            isCurrent ? "text-bora-700" : "text-heading"
          )}
        >
          {track.title}
        </p>
        <p className="truncate text-xs text-caption">
          {track.artist}
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
