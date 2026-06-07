"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
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
  ChevronDown,
  ListMusic,
  MicVocal,
  Share2,
  Download,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatTime, formatSampleRate } from "@/lib/format";
import { trackShareUrl, copyToClipboard } from "@/lib/track-url";
import { canDownload, downloadTrackFile } from "@/lib/download";
import { useAuth } from "@/contexts/AuthContext";
import { useToastStore } from "@/stores/useToastStore";
import { usePlayerStore } from "@/stores/usePlayerStore";
import type { Track } from "@/types/music";
import TrackArtwork from "@/components/music/TrackArtwork";
import RangeSlider from "@/components/player/RangeSlider";
import Visualizer from "@/components/player/Visualizer";
import LyricsPanel from "@/components/player/LyricsPanel";

/* ───────────────────────────────────────────
   NowPlaying — 풀스크린 재생 화면
   dash-hero 그라데이션 패밀리(np-hero) + 부유 도형 +
   회전 바이닐 아트워크 + 실시간 비주얼라이저 + 큐
   ─────────────────────────────────────────── */

export default function NowPlaying() {
  /** 중앙 뷰 — 아트워크/비주얼라이저 또는 가사 */
  const [view, setView] = useState<"art" | "lyrics">("art");
  const open = usePlayerStore((s) => s.nowPlayingOpen);
  const tracks = usePlayerStore((s) => s.tracks);
  const currentId = usePlayerStore((s) => s.currentId);
  const queue = usePlayerStore((s) => s.queue);
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
  const playFromQueue = usePlayerStore((s) => s.playFromQueue);
  const setNowPlayingOpen = usePlayerStore((s) => s.setNowPlayingOpen);
  const addToast = useToastStore((s) => s.addToast);
  const { user } = useAuth();
  const [downloading, setDownloading] = useState(false);
  const allowDownload = canDownload(user?.email);

  async function shareTrack(t: { id: string; title: string }) {
    const url = trackShareUrl(t.id);
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: `${t.title} — Moonwave Music`, url });
        return;
      } catch {
        /* 취소/미지원 → 복사 폴백 */
      }
    }
    if (await copyToClipboard(url)) {
      addToast({ type: "success", message: "공유 링크를 복사했어요" });
    } else {
      addToast({ type: "error", message: "링크 복사에 실패했어요" });
    }
  }

  async function download(t: Track) {
    if (downloading) return;
    setDownloading(true);
    addToast({ type: "info", message: "다운로드를 준비하고 있어요…" });
    try {
      await downloadTrackFile(t);
    } catch (e) {
      addToast({
        type: "error",
        message: e instanceof Error ? e.message : "다운로드에 실패했어요",
      });
    } finally {
      setDownloading(false);
    }
  }

  const track = useMemo(
    () => tracks.find((t) => t.id === currentId) ?? null,
    [tracks, currentId]
  );

  /** 큐에서 현재 곡 다음 4곡 */
  const upNext = useMemo(() => {
    if (!currentId || !queue.length) return [];
    const i = queue.indexOf(currentId);
    return queue
      .slice(i + 1, i + 5)
      .map((id) => tracks.find((t) => t.id === id))
      .filter((t): t is NonNullable<typeof t> => !!t);
  }, [queue, currentId, tracks]);

  /* 열려 있는 동안 바디 스크롤 잠금 */
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  const isFav = track ? favorites.includes(track.id) : false;
  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
  const RepeatIcon = repeat === "one" ? Repeat1 : Repeat;

  return (
    <AnimatePresence>
      {open && track && (
        <motion.div
          key="now-playing"
          className="np-hero z-50"
          role="dialog"
          aria-modal="true"
          aria-label="지금 재생"
          initial={{ opacity: 0, y: 56 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 56 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* 부유 장식 도형 (dash-hero 패밀리) */}
          <div className="dash-hero__shapes" aria-hidden="true">
            <span className="dash-hero__shape dash-hero__shape--a" />
            <span className="dash-hero__shape dash-hero__shape--b" />
            <span className="dash-hero__shape dash-hero__shape--c" />
          </div>

          <div className="relative z-[1] mx-auto flex h-full max-w-2xl flex-col px-5 py-5 sm:px-8 sm:py-6">
            {/* 헤더 */}
            <div className="flex shrink-0 items-center justify-between">
              <button
                onClick={() => setNowPlayingOpen(false)}
                aria-label="닫기"
                className="flex h-10 w-10 items-center justify-center rounded-xl text-white/80 transition-colors hover:bg-white/10 hover:text-white"
              >
                <ChevronDown className="h-6 w-6" />
              </button>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">
                지금 재생 중
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setView((v) => (v === "art" ? "lyrics" : "art"))}
                  aria-label={view === "lyrics" ? "아트워크 보기" : "가사 보기"}
                  aria-pressed={view === "lyrics"}
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-xl transition-colors hover:bg-white/10",
                    view === "lyrics"
                      ? "bg-white/15 text-white"
                      : "text-white/80 hover:text-white"
                  )}
                >
                  <MicVocal className="h-5 w-5" />
                </button>
                {track.visibility === "public" && (
                  <button
                    onClick={() => void shareTrack(track)}
                    aria-label="공유 링크 복사"
                    className="flex h-10 w-10 items-center justify-center rounded-xl text-white/80 transition-colors hover:bg-white/10 hover:text-white"
                  >
                    <Share2 className="h-5 w-5" />
                  </button>
                )}
                {allowDownload && track.visibility === "public" && (
                  <button
                    onClick={() => void download(track)}
                    disabled={downloading}
                    aria-label="음원 다운로드"
                    className="flex h-10 w-10 items-center justify-center rounded-xl text-white/80 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
                  >
                    {downloading ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Download className="h-5 w-5" />
                    )}
                  </button>
                )}
                <button
                  onClick={() => toggleFavorite(track.id)}
                  aria-label={isFav ? "즐겨찾기 해제" : "즐겨찾기 추가"}
                  aria-pressed={isFav}
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-xl transition-colors hover:bg-white/10",
                    isFav ? "text-rose-300" : "text-white/80 hover:text-white"
                  )}
                >
                  <Heart className="h-5 w-5" fill={isFav ? "currentColor" : "none"} />
                </button>
              </div>
            </div>

            {/* 본문 — 가사 뷰 */}
            {view === "lyrics" && (
              <div className="flex min-h-0 flex-1 flex-col py-2">
                <LyricsPanel key={track.id} track={track} />
              </div>
            )}

            {/* 본문 — 바이닐 + 곡 정보 + 비주얼라이저 */}
            <div
              className={cn(
                "flex min-h-0 flex-1 flex-col items-center justify-center gap-6 py-4 sm:gap-8",
                view === "lyrics" && "hidden"
              )}
            >
              <div
                className={cn(
                  "vinyl-spin relative h-52 w-52 overflow-hidden rounded-full shadow-2xl ring-8 ring-white/10 sm:h-64 sm:w-64",
                  !isPlaying && "vinyl-spin--paused"
                )}
              >
                <TrackArtwork trackId={track.id} src={track.coverUrl} />
                {/* 바이닐 센터 홀 */}
                <span className="absolute left-1/2 top-1/2 h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/30 ring-4 ring-white/25 backdrop-blur-sm" />
                <span className="absolute left-1/2 top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/90" />
              </div>

              <div className="w-full text-center">
                <h2 className="truncate text-2xl font-bold tracking-tight sm:text-3xl">
                  {track.title}
                </h2>
                <p className="mt-1.5 truncate text-sm text-white/70">
                  {track.artist}
                  {track.album && ` — ${track.album}`}
                </p>
                {track.sampleRate > 0 && (
                  <div className="mt-3 flex items-center justify-center gap-1.5">
                    {["WAV", formatSampleRate(track.sampleRate), `${track.bitsPerSample}bit`].map(
                      (badge) => (
                        <span
                          key={badge}
                          className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-medium text-white/80 ring-1 ring-white/20 backdrop-blur-sm"
                        >
                          {badge}
                        </span>
                      )
                    )}
                  </div>
                )}
              </div>

              <Visualizer className="h-12 w-full max-w-sm sm:h-16" bars={48} />
            </div>

            {/* 컨트롤 블록 */}
            <div className="shrink-0 space-y-4 pb-[env(safe-area-inset-bottom)]">
              {/* 시킹 */}
              <div className="flex items-center gap-3">
                <span className="w-10 shrink-0 text-right text-xs tabular-nums text-white/70">
                  {formatTime(currentTime)}
                </span>
                <RangeSlider
                  value={currentTime}
                  max={duration}
                  onCommit={seek}
                  light
                  ariaLabel="재생 위치"
                  className="flex-1"
                />
                <span className="w-10 shrink-0 text-xs tabular-nums text-white/70">
                  {formatTime(duration)}
                </span>
              </div>

              {/* 트랜스포트 */}
              <div className="flex items-center justify-center gap-2 sm:gap-3">
                <button
                  onClick={toggleShuffle}
                  aria-label="셔플"
                  aria-pressed={shuffle}
                  className={cn(
                    "flex h-11 w-11 items-center justify-center rounded-xl transition-colors hover:bg-white/10",
                    shuffle ? "text-white" : "text-white/50"
                  )}
                >
                  <Shuffle className="h-5 w-5" />
                </button>
                <button
                  onClick={prev}
                  aria-label="이전 곡"
                  className="flex h-12 w-12 items-center justify-center rounded-xl text-white transition-colors hover:bg-white/10"
                >
                  <SkipBack className="h-7 w-7" fill="currentColor" />
                </button>
                <button
                  onClick={toggle}
                  aria-label={isPlaying ? "일시정지" : "재생"}
                  className="mx-2 flex h-16 w-16 items-center justify-center rounded-full bg-white text-bora-700 shadow-xl shadow-black/20 transition-transform hover:scale-105 active:scale-95"
                >
                  {isPlaying ? (
                    <Pause className="h-7 w-7" fill="currentColor" />
                  ) : (
                    <Play className="h-7 w-7 translate-x-0.5" fill="currentColor" />
                  )}
                </button>
                <button
                  onClick={next}
                  aria-label="다음 곡"
                  className="flex h-12 w-12 items-center justify-center rounded-xl text-white transition-colors hover:bg-white/10"
                >
                  <SkipForward className="h-7 w-7" fill="currentColor" />
                </button>
                <button
                  onClick={cycleRepeat}
                  aria-label={`반복: ${repeat === "off" ? "끔" : repeat === "all" ? "전체" : "한 곡"}`}
                  className={cn(
                    "flex h-11 w-11 items-center justify-center rounded-xl transition-colors hover:bg-white/10",
                    repeat !== "off" ? "text-white" : "text-white/50"
                  )}
                >
                  <RepeatIcon className="h-5 w-5" />
                </button>
              </div>

              {/* 볼륨 */}
              <div className="mx-auto hidden w-56 items-center gap-2.5 sm:flex">
                <button
                  onClick={toggleMute}
                  aria-label={muted ? "음소거 해제" : "음소거"}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <VolumeIcon className="h-4 w-4" />
                </button>
                <RangeSlider
                  value={muted ? 0 : volume}
                  max={1}
                  step={0.02}
                  immediate
                  onCommit={setVolume}
                  light
                  ariaLabel="볼륨"
                  className="flex-1"
                />
              </div>

              {/* 다음 트랙 */}
              {upNext.length > 0 && (
                <div>
                  <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/55">
                    <ListMusic className="h-3.5 w-3.5" aria-hidden="true" />
                    다음 트랙
                  </p>
                  <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
                    {upNext.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => playFromQueue(t.id)}
                        className="flex shrink-0 items-center gap-2 rounded-xl bg-white/10 py-1.5 pl-1.5 pr-3 ring-1 ring-white/15 backdrop-blur-sm transition-colors hover:bg-white/20"
                      >
                        <span className="block h-7 w-7 overflow-hidden rounded-lg">
                          <TrackArtwork trackId={t.id} src={t.coverUrl} />
                        </span>
                        <span className="max-w-36 truncate text-xs font-medium text-white/90">
                          {t.title}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
