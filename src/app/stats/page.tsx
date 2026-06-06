"use client";

import { useMemo } from "react";
import { useTracks } from "@/contexts/TracksContext";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { useDialogStore } from "@/stores/useDialogStore";
import { useToastStore } from "@/stores/useToastStore";
import { formatDurationKo, formatTime, relativeTimeKo } from "@/lib/format";
import { todayISO, addDaysISO, weekdayKo, formatNumber } from "@/lib/utils";
import PageHeader from "@/components/ui/PageHeader";
import StatCard from "@/components/ui/StatCard";
import SectionCard from "@/components/ui/SectionCard";
import EmptyState from "@/components/ui/EmptyState";
import Badge from "@/components/ui/Badge";
import BarChart from "@/components/charts/BarChart";
import RingProgress from "@/components/charts/RingProgress";
import TrackArtwork from "@/components/music/TrackArtwork";
import {
  PlayCircle,
  Clock,
  Trophy,
  Disc3,
  BarChart3,
  CalendarDays,
  History,
  RotateCcw,
  Play,
} from "lucide-react";

/* ───────────────────────────────────────────
   청취 통계 — 재생 기록 분석 (의존성 0 SVG 차트)
   ─────────────────────────────────────────── */

export default function StatsPage() {
  const tracks = useTracks();
  const playCounts = usePlayerStore((s) => s.playCounts);
  const recentPlays = usePlayerStore((s) => s.recentPlays);
  const resetStats = usePlayerStore((s) => s.resetStats);
  const playTrack = usePlayerStore((s) => s.playTrack);
  const openDialog = useDialogStore((s) => s.openDialog);
  const addToast = useToastStore((s) => s.addToast);

  const today = todayISO();

  const totalPlays = useMemo(
    () => Object.values(playCounts).reduce((s, n) => s + n, 0),
    [playCounts]
  );
  const todayPlays = useMemo(
    () => recentPlays.filter((p) => p.at.startsWith(today)).length,
    [recentPlays, today]
  );
  const listenSec = useMemo(
    () => tracks.reduce((s, t) => s + (playCounts[t.id] ?? 0) * t.duration, 0),
    [tracks, playCounts]
  );
  const listenedCount = useMemo(
    () => tracks.filter((t) => (playCounts[t.id] ?? 0) > 0).length,
    [tracks, playCounts]
  );

  const ranked = useMemo(
    () =>
      [...tracks].sort((a, b) => (playCounts[b.id] ?? 0) - (playCounts[a.id] ?? 0)),
    [tracks, playCounts]
  );
  const topTrack = ranked[0] && (playCounts[ranked[0].id] ?? 0) > 0 ? ranked[0] : null;

  /* 곡별 재생 횟수 (보관함 전 곡) */
  const perTrack = useMemo(() => {
    const data = ranked.map((t) => playCounts[t.id] ?? 0);
    const labels = ranked.map((t) =>
      t.title.length > 6 ? `${t.title.slice(0, 6)}…` : t.title
    );
    return { data, labels };
  }, [ranked, playCounts]);

  /* 최근 7일 재생 횟수 */
  const week = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => addDaysISO(today, i - 6));
    return {
      data: days.map((d) => recentPlays.filter((p) => p.at.startsWith(d)).length),
      labels: days.map((d) => (d === today ? "오늘" : weekdayKo(d))),
    };
  }, [recentPlays, today]);

  const recent = useMemo(
    () =>
      recentPlays
        .slice(0, 10)
        .map((p) => ({ ...p, track: tracks.find((t) => t.id === p.id) }))
        .filter((p): p is typeof p & { track: NonNullable<(typeof tracks)[number]> } => !!p.track),
    [recentPlays, tracks]
  );

  function confirmReset() {
    openDialog({
      title: "재생 기록 초기화",
      description:
        "재생 횟수와 최근 재생 기록이 모두 삭제됩니다. 즐겨찾기는 유지돼요. 계속할까요?",
      confirmLabel: "초기화",
      variant: "danger",
      onConfirm: () => {
        resetStats();
        addToast({ type: "success", message: "재생 기록을 초기화했습니다" });
      },
    });
  }

  const hasData = totalPlays > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="청취 통계"
        description="재생 기록으로 보는 나의 음악 패턴"
        secondaryAction={
          hasData
            ? { label: "기록 초기화", icon: RotateCcw, onClick: confirmReset }
            : undefined
        }
      />

      {/* 핵심 지표 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="총 재생"
          value={formatNumber(totalPlays)}
          unit="회"
          icon={PlayCircle}
          sub={`오늘 ${todayPlays}회`}
        />
        <StatCard
          label="총 청취 시간"
          value={formatDurationKo(listenSec)}
          icon={Clock}
          iconClassName="text-indigo-600 bg-indigo-50"
          sub="재생 횟수 × 곡 길이 추정"
        />
        <StatCard
          label="최다 재생 곡"
          value={
            topTrack ? (
              <span className="text-lg leading-tight">{topTrack.title}</span>
            ) : (
              "—"
            )
          }
          icon={Trophy}
          iconClassName="text-amber-600 bg-amber-50"
          sub={topTrack ? `${playCounts[topTrack.id]}회 재생` : "기록 없음"}
        />
        <StatCard
          label="들어본 곡"
          value={`${listenedCount}/${tracks.length}`}
          unit="곡"
          icon={Disc3}
          iconClassName="text-emerald-600 bg-emerald-50"
          sub={`보관함의 ${Math.round((listenedCount / Math.max(1, tracks.length)) * 100)}%`}
        />
      </div>

      {!hasData ? (
        <EmptyState
          icon={BarChart3}
          title="아직 재생 기록이 없습니다"
          description="음악을 재생하면 곡별 횟수·일별 추이가 이곳에 쌓여요."
        />
      ) : (
        <>
          {/* 차트 — 곡별 + 7일 추이 */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <SectionCard
              title="곡별 재생 횟수"
              icon={BarChart3}
              description="많이 들은 순"
            >
              <BarChart
                data={perTrack.data}
                labels={perTrack.labels}
                color="#7c3aed"
                height={180}
                unit="회"
              />
            </SectionCard>

            <SectionCard
              title="최근 7일 재생"
              icon={CalendarDays}
              description={`이번 주 ${week.data.reduce((s, n) => s + n, 0)}회`}
            >
              <BarChart
                data={week.data}
                labels={week.labels}
                color="#6366f1"
                height={180}
                unit="회"
              />
            </SectionCard>
          </div>

          {/* 커버리지 + 최근 기록 */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <SectionCard
              title="보관함 커버리지"
              icon={Disc3}
              description="들어본 곡 비율"
            >
              <div className="flex items-center gap-5">
                <RingProgress
                  value={listenedCount}
                  max={Math.max(1, tracks.length)}
                  size={112}
                  strokeWidth={12}
                  color="#7c3aed"
                >
                  <span className="text-lg font-bold text-heading">
                    {Math.round((listenedCount / Math.max(1, tracks.length)) * 100)}%
                  </span>
                  <span className="text-[10px] text-caption">
                    {listenedCount}/{tracks.length}곡
                  </span>
                </RingProgress>
                <div className="min-w-0 flex-1 space-y-2">
                  {ranked.slice(0, 3).map((t, i) => (
                    <div key={t.id} className="flex items-center gap-2.5">
                      <Badge
                        className={
                          i === 0
                            ? "bg-amber-50 text-amber-700"
                            : "bg-surface-secondary text-body"
                        }
                      >
                        {i + 1}위
                      </Badge>
                      <span className="min-w-0 flex-1 truncate text-sm text-heading">
                        {t.title}
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-caption">
                        {playCounts[t.id] ?? 0}회
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </SectionCard>

            <SectionCard
              title="최근 재생 기록"
              icon={History}
              description="최근 10건"
              bodyClassName="p-0"
            >
              <ul className="divide-y divide-surface-2">
                {recent.map((p, i) => (
                  <li
                    key={`${p.id}-${p.at}-${i}`}
                    role="button"
                    tabIndex={0}
                    aria-label={`${p.track.title} 재생`}
                    className="flex cursor-pointer items-center gap-3 px-5 py-2.5 transition-colors hover:bg-surface-secondary/60 focus-visible:bg-surface-secondary/60 focus-visible:outline-none"
                    onClick={() => playTrack(p.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        playTrack(p.id);
                      }
                    }}
                  >
                    <span className="h-8 w-8 shrink-0 overflow-hidden rounded-lg">
                      <TrackArtwork trackId={p.id} src={p.track.coverUrl} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-heading">
                        {p.track.title}
                      </p>
                      <p className="text-xs text-caption">{relativeTimeKo(p.at)}</p>
                    </div>
                    <span className="shrink-0 text-xs tabular-nums text-caption">
                      {formatTime(p.track.duration)}
                    </span>
                    <Play className="h-3.5 w-3.5 shrink-0 text-caption" />
                  </li>
                ))}
              </ul>
            </SectionCard>
          </div>
        </>
      )}
    </div>
  );
}
