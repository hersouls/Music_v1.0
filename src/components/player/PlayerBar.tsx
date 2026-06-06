"use client";

import { useMemo } from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Heart,
  Volume2,
  Volume1,
  VolumeX,
  ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/format";
import { usePlayerStore } from "@/stores/usePlayerStore";
import TrackArtwork from "@/components/music/TrackArtwork";
import RangeSlider from "@/components/player/RangeSlider";

/* ───────────────────────────────────────────
   PlayerBar — 하단 고정 글로벌 플레이어
   데스크톱: 3분할(트랙 | 트랜스포트+시킹 | 볼륨·확장)
   모바일: 컴팩트(상단 진행 라인 + 재생/다음)
   ─────────────────────────────────────────── */

export default function PlayerBar() {
  const tracks = usePlayerStore((s) => s.tracks);
  const currentId = usePlayerStore((s) => s.currentId);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const duration = usePlayerStore((s) => s.duration);
  const volume = usePlayerStore((s) => s.volume);
  const muted = usePlayerStore((s) => s.muted);
  const shuffle = usePlayerStore((s) => s.shuffle);
  const repeat = usePlayerStore((s) => s.repeat);
  const favorites = usePlayerStore((s) => s.favorites);
  const toggle = usePlayerStore((s) => s.toggle);
  const next = usePlayerStore((s) => s.next);
  const prev = usePlayerStore((s) => s.prev);
  const seek = usePlayerStore((s) => s.seek);
  const setVolume = usePlayerStore((s) => s.setVolume);
  const toggleMute = usePlayerStore((s) => s.toggleMute);
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle);
  const cycleRepeat = usePlayerStore((s) => s.cycleRepeat);
  const toggleFavorite = usePlayerStore((s) => s.toggleFavorite);
  const setNowPlayingOpen = usePlayerStore((s) => s.setNowPlayingOpen);

  const track = useMemo(
    () => tracks.find((t) => t.id === currentId) ?? null,
    [tracks, currentId]
  );

  if (!track) return null;

  const isFav = favorites.includes(track.id);
  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
  const RepeatIcon = repeat === "one" ? Repeat1 : Repeat;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-strong bg-surface-primary/90 backdrop-blur-md">
      {/* 모바일 진행 라인 */}
      <div
        className="absolute left-0 top-0 h-0.5 bg-bora-600 transition-[width] duration-300 sm:hidden"
        style={{ width: `${progressPct}%` }}
        aria-hidden="true"
      />

      <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-3 px-3 sm:h-20 sm:gap-4 sm:px-6">
        {/* 트랙 정보 — 탭하면 전체 화면 */}
        <button
          onClick={() => setNowPlayingOpen(true)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left sm:w-[30%] sm:flex-none"
          aria-label="지금 재생 화면 열기"
        >
          <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl shadow-sm sm:h-12 sm:w-12">
            <TrackArtwork trackId={track.id} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-heading">
              {track.title}
            </p>
            <p className="truncate text-xs text-caption">{track.artist}</p>
          </div>
        </button>

        <button
          onClick={() => toggleFavorite(track.id)}
          aria-label={isFav ? "즐겨찾기 해제" : "즐겨찾기 추가"}
          aria-pressed={isFav}
          className={cn(
            "hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-surface-tertiary sm:flex",
            isFav ? "text-rose-500" : "text-caption hover:text-rose-500"
          )}
        >
          <Heart className="h-4 w-4" fill={isFav ? "currentColor" : "none"} />
        </button>

        {/* 트랜스포트 + 시킹 (데스크톱) */}
        <div className="hidden flex-1 flex-col items-center gap-1 sm:flex">
          <div className="flex items-center gap-1">
            <button
              onClick={toggleShuffle}
              aria-label="셔플"
              aria-pressed={shuffle}
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-surface-tertiary",
                shuffle ? "text-bora-600" : "text-caption"
              )}
            >
              <Shuffle className="h-4 w-4" />
            </button>
            <button
              onClick={prev}
              aria-label="이전 곡"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-body transition-colors hover:bg-surface-tertiary"
            >
              <SkipBack className="h-5 w-5" fill="currentColor" />
            </button>
            <button
              onClick={toggle}
              aria-label={isPlaying ? "일시정지" : "재생"}
              className="mx-1 flex h-10 w-10 items-center justify-center rounded-full bg-bora-600 text-white shadow-bora-glow transition-all hover:bg-bora-700 hover:scale-105 active:scale-95"
            >
              {isPlaying ? (
                <Pause className="h-5 w-5" fill="currentColor" />
              ) : (
                <Play className="h-5 w-5 translate-x-px" fill="currentColor" />
              )}
            </button>
            <button
              onClick={next}
              aria-label="다음 곡"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-body transition-colors hover:bg-surface-tertiary"
            >
              <SkipForward className="h-5 w-5" fill="currentColor" />
            </button>
            <button
              onClick={cycleRepeat}
              aria-label={`반복: ${repeat === "off" ? "끔" : repeat === "all" ? "전체" : "한 곡"}`}
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-surface-tertiary",
                repeat !== "off" ? "text-bora-600" : "text-caption"
              )}
            >
              <RepeatIcon className="h-4 w-4" />
            </button>
          </div>
          <div className="flex w-full max-w-xl items-center gap-2.5">
            <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-caption">
              {formatTime(currentTime)}
            </span>
            <RangeSlider
              value={currentTime}
              max={duration}
              onCommit={seek}
              ariaLabel="재생 위치"
              className="flex-1"
            />
            <span className="w-10 shrink-0 text-[11px] tabular-nums text-caption">
              {formatTime(duration)}
            </span>
          </div>
        </div>

        {/* 우측 — 볼륨 + 확장 (데스크톱) */}
        <div className="hidden shrink-0 items-center justify-end gap-1 sm:flex sm:w-[22%]">
          <button
            onClick={toggleMute}
            aria-label={muted ? "음소거 해제" : "음소거"}
            className="hidden h-9 w-9 items-center justify-center rounded-lg text-caption transition-colors hover:bg-surface-tertiary hover:text-body lg:flex"
          >
            <VolumeIcon className="h-4 w-4" />
          </button>
          <RangeSlider
            value={muted ? 0 : volume}
            max={1}
            step={0.02}
            immediate
            onCommit={setVolume}
            ariaLabel="볼륨"
            className="hidden w-24 lg:block"
          />
          <button
            onClick={() => setNowPlayingOpen(true)}
            aria-label="지금 재생 화면 열기"
            className="ml-1 flex h-9 w-9 items-center justify-center rounded-lg text-caption transition-colors hover:bg-surface-tertiary hover:text-body"
          >
            <ChevronUp className="h-5 w-5" />
          </button>
        </div>

        {/* 모바일 트랜스포트 */}
        <div className="flex shrink-0 items-center gap-1 sm:hidden">
          <button
            onClick={() => toggleFavorite(track.id)}
            aria-label={isFav ? "즐겨찾기 해제" : "즐겨찾기 추가"}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-lg",
              isFav ? "text-rose-500" : "text-caption"
            )}
          >
            <Heart className="h-4 w-4" fill={isFav ? "currentColor" : "none"} />
          </button>
          <button
            onClick={toggle}
            aria-label={isPlaying ? "일시정지" : "재생"}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-bora-600 text-white shadow-bora-glow active:scale-95"
          >
            {isPlaying ? (
              <Pause className="h-5 w-5" fill="currentColor" />
            ) : (
              <Play className="h-5 w-5 translate-x-px" fill="currentColor" />
            )}
          </button>
          <button
            onClick={next}
            aria-label="다음 곡"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-body"
          >
            <SkipForward className="h-5 w-5" fill="currentColor" />
          </button>
        </div>
      </div>
    </div>
  );
}
