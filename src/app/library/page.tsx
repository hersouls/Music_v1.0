"use client";

import { useMemo, useState } from "react";
import { useTracks } from "@/contexts/TracksContext";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { formatBytes, formatDurationKo, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import PageHeader from "@/components/ui/PageHeader";
import StatCard from "@/components/ui/StatCard";
import SectionCard from "@/components/ui/SectionCard";
import EmptyState from "@/components/ui/EmptyState";
import TrackRow from "@/components/music/TrackRow";
import { fieldInputClass } from "@/components/ui/Form";
import {
  Music2,
  Clock,
  HardDrive,
  Timer,
  Play,
  Shuffle,
  Search,
  ListMusic,
} from "lucide-react";

/* ───────────────────────────────────────────
   보관함 — 전체 트랙 목록 (검색 · 정렬 · 통계)
   ─────────────────────────────────────────── */

type SortKey = "title" | "duration" | "plays" | "size";

const SORT_LABEL: Record<SortKey, string> = {
  title: "이름순",
  duration: "길이순",
  plays: "재생 많은순",
  size: "용량순",
};

export default function LibraryPage() {
  const tracks = useTracks();
  const playCounts = usePlayerStore((s) => s.playCounts);
  const playAll = usePlayerStore((s) => s.playAll);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("title");

  const totalSec = useMemo(() => tracks.reduce((s, t) => s + t.duration, 0), [tracks]);
  const totalBytes = useMemo(() => tracks.reduce((s, t) => s + t.sizeBytes, 0), [tracks]);
  const avgSec = tracks.length ? totalSec / tracks.length : 0;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? tracks.filter(
          (t) =>
            t.title.toLowerCase().includes(q) || t.fileName.toLowerCase().includes(q)
        )
      : tracks;
    const sorted = [...filtered];
    switch (sortKey) {
      case "title":
        sorted.sort((a, b) => a.title.localeCompare(b.title, "ko"));
        break;
      case "duration":
        sorted.sort((a, b) => b.duration - a.duration);
        break;
      case "plays":
        sorted.sort((a, b) => (playCounts[b.id] ?? 0) - (playCounts[a.id] ?? 0));
        break;
      case "size":
        sorted.sort((a, b) => b.sizeBytes - a.sizeBytes);
        break;
    }
    return sorted;
  }, [tracks, query, sortKey, playCounts]);

  const visibleIds = useMemo(() => visible.map((t) => t.id), [visible]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="보관함"
        description={`전체 ${tracks.length}곡 · ${formatDurationKo(totalSec)} · WAV 무손실`}
        action={{ label: "전체 재생", icon: Play, onClick: () => playAll({ shuffle: false }) }}
        secondaryAction={{ label: "셔플", icon: Shuffle, onClick: () => playAll({ shuffle: true }) }}
      />

      {/* 통계 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="전체 트랙" value={tracks.length} unit="곡" icon={Music2} />
        <StatCard
          label="총 재생 길이"
          value={formatDurationKo(totalSec)}
          icon={Clock}
          iconClassName="text-indigo-600 bg-indigo-50"
        />
        <StatCard
          label="보관 용량"
          value={formatBytes(totalBytes)}
          icon={HardDrive}
          iconClassName="text-emerald-600 bg-emerald-50"
          sub="원본 무손실 WAV"
        />
        <StatCard
          label="평균 트랙 길이"
          value={formatTime(avgSec)}
          icon={Timer}
          iconClassName="text-amber-600 bg-amber-50"
        />
      </div>

      {/* 검색 + 정렬 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-caption"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="트랙 검색 (제목 · 파일명)"
            aria-label="트랙 검색"
            className={cn(fieldInputClass, "pl-10")}
          />
        </div>
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          aria-label="정렬 기준"
          className={cn(fieldInputClass, "sm:w-44")}
        >
          {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
            <option key={k} value={k}>
              {SORT_LABEL[k]}
            </option>
          ))}
        </select>
      </div>

      {/* 트랙 목록 */}
      {visible.length === 0 ? (
        query ? (
          <EmptyState
            icon={Search}
            title="검색 결과가 없습니다"
            description={`“${query.trim()}” 와 일치하는 트랙이 없어요. 다른 검색어를 시도해 보세요.`}
          />
        ) : (
          <EmptyState
            icon={ListMusic}
            title="보관함이 비어 있습니다"
            description=".Music 폴더에 WAV 파일을 넣으면 자동으로 보관함에 나타납니다."
          />
        )
      ) : (
        <SectionCard
          title="트랙"
          icon={ListMusic}
          description={`${visible.length}곡 · ${SORT_LABEL[sortKey]}`}
          bodyClassName="p-0"
        >
          <ul className="divide-y divide-surface-2">
            {visible.map((t, i) => (
              <TrackRow
                key={t.id}
                track={t}
                index={i + 1}
                contextIds={visibleIds}
                showPlayCount
              />
            ))}
          </ul>
        </SectionCard>
      )}
    </div>
  );
}
