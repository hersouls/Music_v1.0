"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion, type Variants } from "framer-motion";
import { useTracks } from "@/contexts/TracksContext";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { NAV_ITEMS } from "@/lib/nav";
import { BRAND_TAGLINE } from "@/lib/constants";
import { formatDurationKo, formatTime, relativeTimeKo } from "@/lib/format";
import { todayISO, addDaysISO, formatMonthDayKo, formatNumber } from "@/lib/utils";
import SectionCard from "@/components/ui/SectionCard";
import RingProgress from "@/components/charts/RingProgress";
import Sparkline from "@/components/charts/Sparkline";
import TrackRow from "@/components/music/TrackRow";
import TrackArtwork from "@/components/music/TrackArtwork";
import EqBars from "@/components/music/EqBars";
import {
  Library,
  Heart,
  PlayCircle,
  BarChart3,
  ListMusic,
  History,
  Sparkles,
  Play,
  Shuffle,
  ChevronRight,
  Disc3,
  type LucideIcon,
} from "lucide-react";

/* ── framer-motion 진입 애니메이션 변형 (Health 대시보드 패리티) ── */
const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.04 } },
};
const item: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } },
};

export default function HomePage() {
  const tracks = useTracks();
  const playCounts = usePlayerStore((s) => s.playCounts);
  const recentPlays = usePlayerStore((s) => s.recentPlays);
  const favorites = usePlayerStore((s) => s.favorites);
  const lastTrackId = usePlayerStore((s) => s.lastTrackId);
  const currentId = usePlayerStore((s) => s.currentId);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const toggle = usePlayerStore((s) => s.toggle);
  const playAll = usePlayerStore((s) => s.playAll);
  const playTrack = usePlayerStore((s) => s.playTrack);
  const setNowPlayingOpen = usePlayerStore((s) => s.setNowPlayingOpen);

  const today = todayISO();

  /* 시간대 인사 — 하이드레이션 불일치 방지 위해 마운트 후 계산 */
  const [greeting, setGreeting] = useState("안녕하세요");
  useEffect(() => {
    const h = new Date().getHours();
    setGreeting(
      h < 6 ? "고요한 새벽이에요" : h < 12 ? "좋은 아침이에요" : h < 18 ? "좋은 오후예요" : "좋은 저녁이에요"
    );
  }, []);

  const totalSec = useMemo(() => tracks.reduce((s, t) => s + t.duration, 0), [tracks]);
  const totalPlays = useMemo(
    () => Object.values(playCounts).reduce((s, n) => s + n, 0),
    [playCounts]
  );
  const todayPlays = useMemo(
    () => recentPlays.filter((p) => p.at.startsWith(today)).length,
    [recentPlays, today]
  );
  const todayUnique = useMemo(
    () => new Set(recentPlays.filter((p) => p.at.startsWith(today)).map((p) => p.id)).size,
    [recentPlays, today]
  );
  const listenedCount = useMemo(
    () => tracks.filter((t) => (playCounts[t.id] ?? 0) > 0).length,
    [tracks, playCounts]
  );

  /* 최다 재생 곡 */
  const topTrack = useMemo(() => {
    let best: { title: string; count: number } | null = null;
    for (const t of tracks) {
      const c = playCounts[t.id] ?? 0;
      if (c > 0 && (!best || c > best.count)) best = { title: t.title, count: c };
    }
    return best;
  }, [tracks, playCounts]);

  /* 빠른 재생 — 재생수 상위 4 (기록 없으면 보관함 앞 4곡) */
  const quickTracks = useMemo(() => {
    const ranked = [...tracks].sort(
      (a, b) => (playCounts[b.id] ?? 0) - (playCounts[a.id] ?? 0)
    );
    return ranked.slice(0, 4);
  }, [tracks, playCounts]);

  /* 최근 재생 — 중복 제거 후 6곡 */
  const recentTracks = useMemo(() => {
    const seen = new Set<string>();
    const out: { track: (typeof tracks)[number]; at: string }[] = [];
    for (const p of recentPlays) {
      if (seen.has(p.id)) continue;
      const track = tracks.find((t) => t.id === p.id);
      if (!track) continue;
      seen.add(p.id);
      out.push({ track, at: p.at });
      if (out.length >= 6) break;
    }
    return out;
  }, [recentPlays, tracks]);

  /* 최근 7일 재생 횟수 (스파크라인) */
  const week = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => addDaysISO(today, i - 6));
    return days.map((d) => recentPlays.filter((p) => p.at.startsWith(d)).length);
  }, [recentPlays, today]);

  const lastTrack = useMemo(
    () => tracks.find((t) => t.id === lastTrackId) ?? null,
    [tracks, lastTrackId]
  );

  const heroChips: { icon: LucideIcon; label: string; value: string; sub: string }[] = [
    {
      icon: Library,
      label: "전체 트랙",
      value: `${tracks.length}곡`,
      sub: `총 ${formatDurationKo(totalSec)}`,
    },
    {
      icon: Heart,
      label: "즐겨찾기",
      value: `${favorites.length}곡`,
      sub: favorites.length ? `보관함의 ${Math.round((favorites.length / Math.max(1, tracks.length)) * 100)}%` : "하트로 모아보세요",
    },
    {
      icon: PlayCircle,
      label: "오늘 재생",
      value: `${todayPlays}회`,
      sub: todayUnique ? `${todayUnique}곡 감상` : "아직 재생 없음",
    },
    {
      icon: BarChart3,
      label: "총 재생",
      value: `${formatNumber(totalPlays)}회`,
      sub: topTrack ? `최다 「${topTrack.title}」` : "기록 없음",
    },
  ];

  return (
    <motion.div className="space-y-6" variants={container} initial="hidden" animate="show">
      {/* 1. 히어로 — 인사 + 이어 듣기 + 핵심 지표 */}
      <motion.div variants={item}>
        <div className="dash-hero p-6 sm:p-8">
          <div className="dash-hero__shapes" aria-hidden="true">
            <span className="dash-hero__shape dash-hero__shape--a" />
            <span className="dash-hero__shape dash-hero__shape--b" />
            <span className="dash-hero__shape dash-hero__shape--c" />
          </div>

          <div className="dash-hero__content">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-white/75">{formatMonthDayKo(today)}</p>
                <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
                  {greeting} <span className="inline-block">🎧</span>
                </h1>
                <p className="mt-1.5 text-sm text-white/80">{BRAND_TAGLINE}</p>
              </div>
              {isPlaying && (
                <button
                  onClick={() => setNowPlayingOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs font-medium text-white ring-1 ring-white/20 backdrop-blur-sm transition-colors hover:bg-white/25"
                >
                  <EqBars className="text-white" />
                  재생 중
                </button>
              )}
            </div>

            {/* 오늘의 청취 — 이어 듣기 CTA */}
            <div className="mt-6 flex items-center gap-4 rounded-2xl bg-white/10 p-4 ring-1 ring-white/20 backdrop-blur-sm sm:gap-5 sm:p-5">
              <RingProgress
                value={listenedCount}
                max={Math.max(1, tracks.length)}
                size={72}
                strokeWidth={7}
                color="#ffffff"
                trackColor="rgba(255,255,255,0.22)"
              >
                <span className="text-base font-bold leading-none text-white">
                  {listenedCount}
                  <span className="text-[11px] font-medium text-white/70">/{tracks.length}</span>
                </span>
                <span className="mt-0.5 text-[9px] text-white/70">곡</span>
              </RingProgress>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold sm:text-base">오늘의 청취</p>
                <p className="mt-1 truncate text-xs text-white/75 sm:text-sm">
                  {todayPlays > 0
                    ? `오늘 ${todayUnique}곡 · ${todayPlays}회 재생했어요`
                    : lastTrack
                      ? `마지막 감상 「${lastTrack.title}」 — 이어서 들어보세요`
                      : "첫 곡을 재생해 파도에 올라타 보세요"}
                </p>
              </div>
              <button
                onClick={() => {
                  if (isPlaying) setNowPlayingOpen(true);
                  else toggle();
                }}
                className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white px-3.5 py-2 text-xs font-bold text-bora-700 shadow-lg shadow-black/10 transition-all hover:scale-[1.04] hover:shadow-xl active:scale-95 sm:gap-1.5 sm:px-4 sm:py-2.5 sm:text-sm"
              >
                <Play className="h-4 w-4" fill="currentColor" />
                {isPlaying ? "지금 재생" : lastTrack ? "이어 듣기" : "재생 시작"}
              </button>
            </div>

            {/* 핵심 지표 칩 */}
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {heroChips.map((c) => {
                const Icon = c.icon;
                return (
                  <div
                    key={c.label}
                    className="rounded-2xl bg-white/10 px-4 py-3 ring-1 ring-white/15 backdrop-blur-sm"
                  >
                    <div className="flex items-center gap-1.5 text-xs font-medium text-white/75">
                      <Icon className="h-3.5 w-3.5" />
                      {c.label}
                    </div>
                    <p className="mt-1.5 text-xl font-bold leading-none">{c.value}</p>
                    <p className="mt-1.5 truncate text-[11px] text-white/60">{c.sub}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </motion.div>

      {/* 2. 빠른 재생 (Health "자주 사용" 퀵바 패리티) */}
      {quickTracks.length > 0 && (
        <motion.div variants={item}>
          <div className="flex items-baseline gap-2 px-1">
            <h2 className="flex items-center gap-1.5 text-sm font-bold text-heading">
              <Sparkles className="h-4 w-4 text-bora-500" />
              빠른 재생
            </h2>
            <span className="text-[11px] text-caption">
              {totalPlays > 0 ? "최근 재생 패턴 기반" : "보관함 추천"}
            </span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
            {quickTracks.map((t) => {
              const active = currentId === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => (active ? toggle() : playTrack(t.id))}
                  className="group flex min-w-0 items-center gap-2.5 rounded-2xl border border-strong bg-surface-primary px-3 py-2.5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-bora-200 hover:shadow-md"
                >
                  <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl">
                    <TrackArtwork trackId={t.id} />
                    <span className="absolute inset-0 flex items-center justify-center bg-black/35 text-white opacity-0 transition-opacity group-hover:opacity-100">
                      <Play className="h-4 w-4 translate-x-px" fill="currentColor" />
                    </span>
                  </span>
                  <span className="min-w-0 flex-1 text-left">
                    <span
                      className={`block max-w-full truncate text-xs font-semibold sm:text-sm ${
                        active ? "text-bora-700" : "text-heading"
                      }`}
                    >
                      {t.title}
                    </span>
                    <span className="block text-[11px] text-caption">
                      {formatTime(t.duration)}
                      {(playCounts[t.id] ?? 0) > 0 && ` · ${playCounts[t.id]}회`}
                    </span>
                  </span>
                  {active && isPlaying && <EqBars className="shrink-0 text-bora-600" />}
                </button>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* 3. 벤토 그리드 — 메인(전체 트랙) + 사이드 레일(최근 재생·인사이트) */}
      <div className="space-y-6 xl:grid xl:grid-cols-12 xl:items-start xl:gap-6 xl:space-y-0">
        <div className="space-y-6 xl:col-span-8">
          <motion.div variants={item}>
            <SectionCard
              title="전체 트랙"
              icon={ListMusic}
              description={`${tracks.length}곡 · ${formatDurationKo(totalSec)}`}
              action={
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => playAll({ shuffle: false })}
                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-bora-600 transition-colors hover:bg-bora-50 hover:text-bora-700"
                  >
                    <Play className="h-3.5 w-3.5" fill="currentColor" /> 재생
                  </button>
                  <button
                    onClick={() => playAll({ shuffle: true })}
                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-bora-600 transition-colors hover:bg-bora-50 hover:text-bora-700"
                  >
                    <Shuffle className="h-3.5 w-3.5" /> 셔플
                  </button>
                </div>
              }
              bodyClassName="p-0"
            >
              {tracks.length === 0 ? (
                <p className="px-5 py-10 text-center text-sm text-caption">
                  아직 등록한 곡이 없습니다 — 보관함에서 곡을 올려보세요
                </p>
              ) : (
                <ul className="divide-y divide-surface-2">
                  {tracks.map((t, i) => (
                    <TrackRow key={t.id} track={t} index={i + 1} showPlayCount />
                  ))}
                </ul>
              )}
            </SectionCard>
          </motion.div>
        </div>

        <div className="space-y-6 xl:col-span-4">
          {/* 최근 재생 */}
          <motion.div variants={item}>
            <SectionCard
              title="최근 재생"
              icon={History}
              action={<ManageLink href="/stats" label="기록" />}
              bodyClassName="p-0"
            >
              {recentTracks.length === 0 ? (
                <p className="px-5 py-10 text-center text-sm text-caption">
                  아직 재생 기록이 없습니다
                </p>
              ) : (
                <ul className="divide-y divide-surface-2">
                  {recentTracks.map(({ track, at }) => (
                    <li
                      key={track.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`${track.title} 재생`}
                      className="flex cursor-pointer items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-secondary/60 focus-visible:bg-surface-secondary/60 focus-visible:outline-none"
                      onClick={() => playTrack(track.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          e.stopPropagation();
                          playTrack(track.id);
                        }
                      }}
                    >
                      <span className="h-9 w-9 shrink-0 overflow-hidden rounded-lg">
                        <TrackArtwork trackId={track.id} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-heading">
                          {track.title}
                        </p>
                        <p className="truncate text-xs text-caption">{relativeTimeKo(at)}</p>
                      </div>
                      <Play className="h-4 w-4 shrink-0 text-caption" />
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          </motion.div>

          {/* 청취 인사이트 */}
          <motion.div variants={item}>
            <SectionCard title="청취 인사이트" icon={Disc3}>
              <div className="space-y-5">
                <div className="flex items-center gap-4">
                  <RingProgress
                    value={listenedCount}
                    max={Math.max(1, tracks.length)}
                    size={88}
                    strokeWidth={10}
                    color="#7c3aed"
                  >
                    <span className="text-sm font-bold text-heading">
                      {Math.round((listenedCount / Math.max(1, tracks.length)) * 100)}%
                    </span>
                    <span className="text-[10px] text-caption">들어봄</span>
                  </RingProgress>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <p className="text-sm font-medium text-heading">
                      보관함의 {listenedCount}/{tracks.length}곡 감상
                    </p>
                    <p className="text-xs text-caption">
                      {topTrack
                        ? `최다 재생 「${topTrack.title}」 ${topTrack.count}회`
                        : "재생을 시작하면 통계가 쌓여요"}
                    </p>
                  </div>
                </div>
                <div>
                  <p className="mb-1 text-xs text-caption">최근 7일 재생</p>
                  <Sparkline data={week} color="#7c3aed" height={44} />
                </div>
              </div>
            </SectionCard>
          </motion.div>
        </div>
      </div>

      {/* 4. 모듈 바로가기 */}
      <motion.div variants={item}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {NAV_ITEMS.filter((n) => n.href !== "/").map(({ href, label, icon: Icon, desc }) => (
            <Link
              key={href}
              href={href}
              className="group block h-full rounded-2xl border border-strong bg-surface-primary p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-bora-200 hover:shadow-md"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-bora-50 text-bora-600 transition-colors group-hover:bg-bora-600 group-hover:text-white">
                <Icon className="h-5 w-5" />
              </div>
              <p className="mt-3 text-sm font-bold text-heading">{label}</p>
              <p className="mt-0.5 text-xs text-caption">{desc}</p>
            </Link>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

/* 섹션 헤더 보조 링크 (Health ManageLink 패리티) */
function ManageLink({ href, label = "관리" }: { href: string; label?: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-0.5 text-xs font-medium text-bora-600 hover:text-bora-700"
    >
      {label} <ChevronRight className="h-3.5 w-3.5" />
    </Link>
  );
}
