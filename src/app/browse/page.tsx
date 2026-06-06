"use client";

import { useMemo, useState } from "react";
import { usePublicTracks, useTracksLoading } from "@/contexts/TracksContext";
import { useAuth } from "@/contexts/AuthContext";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { formatDurationKo } from "@/lib/format";
import { cn } from "@/lib/utils";
import PageHeader from "@/components/ui/PageHeader";
import StatCard from "@/components/ui/StatCard";
import SectionCard from "@/components/ui/SectionCard";
import EmptyState from "@/components/ui/EmptyState";
import TrackRow from "@/components/music/TrackRow";
import { fieldInputClass } from "@/components/ui/Form";
import {
  Compass,
  Loader2,
  Music2,
  Play,
  Search,
  Shuffle,
  Users,
} from "lucide-react";

/* ───────────────────────────────────────────
   둘러보기 — 모두의 공개 곡 (최신 업로드 순)
   업로더별 그룹 · 검색 · 전체/셔플 재생
   ─────────────────────────────────────────── */

export default function BrowsePage() {
  const publicTracks = usePublicTracks();
  const loading = useTracksLoading();
  const { uid } = useAuth();
  const playAll = usePlayerStore((s) => s.playAll);
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return publicTracks;
    return publicTracks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.album.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        t.ownerName.toLowerCase().includes(q)
    );
  }, [publicTracks, query]);

  const visibleIds = useMemo(() => visible.map((t) => t.id), [visible]);
  const totalSec = useMemo(
    () => publicTracks.reduce((s, t) => s + t.duration, 0),
    [publicTracks]
  );

  /* 업로더별 그룹 — 내 곡 그룹이 먼저, 나머지는 곡 많은 순 */
  const ownerGroups = useMemo(() => {
    const map = new Map<string, { name: string; mine: boolean; list: typeof visible }>();
    for (const t of visible) {
      const g = map.get(t.ownerUid);
      if (g) g.list.push(t);
      else
        map.set(t.ownerUid, {
          name: t.ownerName || "이름 없음",
          mine: t.ownerUid === uid,
          list: [t],
        });
    }
    return [...map.values()].sort(
      (a, b) => Number(b.mine) - Number(a.mine) || b.list.length - a.list.length
    );
  }, [visible, uid]);

  const uploaderCount = useMemo(
    () => new Set(publicTracks.map((t) => t.ownerUid)).size,
    [publicTracks]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="둘러보기"
        description={
          publicTracks.length
            ? `공개 곡 ${publicTracks.length}곡 · ${formatDurationKo(totalSec)}`
            : "모두가 공개한 곡을 감상해 보세요"
        }
        action={
          publicTracks.length
            ? {
                label: "전체 재생",
                icon: Play,
                onClick: () => playAll({ shuffle: false, ids: visibleIds }),
              }
            : undefined
        }
        secondaryAction={
          publicTracks.length > 1
            ? {
                label: "셔플",
                icon: Shuffle,
                onClick: () => playAll({ shuffle: true, ids: visibleIds }),
              }
            : undefined
        }
      />

      {/* 통계 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="공개 곡" value={publicTracks.length} unit="곡" icon={Music2} />
        <StatCard
          label="업로더"
          value={uploaderCount}
          unit="명"
          icon={Users}
          iconClassName="text-indigo-600 bg-indigo-50"
        />
        <StatCard
          label="총 재생 길이"
          value={formatDurationKo(totalSec)}
          icon={Compass}
          iconClassName="text-emerald-600 bg-emerald-50"
          sub="최신 업로드 순"
        />
      </div>

      {/* 검색 */}
      <div className="relative">
        <Search
          className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-caption"
          aria-hidden="true"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="공개 곡 검색 (제목 · 앨범 · 업로더)"
          aria-label="공개 곡 검색"
          className={cn(fieldInputClass, "pl-10")}
        />
      </div>

      {loading && publicTracks.length === 0 ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-bora-500" />
        </div>
      ) : visible.length === 0 ? (
        query ? (
          <EmptyState
            icon={Search}
            title="검색 결과가 없습니다"
            description={`“${query.trim()}” 와 일치하는 공개 곡이 없어요.`}
          />
        ) : (
          <EmptyState
            icon={Compass}
            title="아직 공개된 곡이 없습니다"
            description="보관함에서 곡을 공개로 전환하거나, 공개로 업로드하면 이곳에 모여요."
          />
        )
      ) : (
        ownerGroups.map(({ name, mine, list }) => {
          const ids = list.map((t) => t.id);
          const sec = list.reduce((s, t) => s + t.duration, 0);
          return (
            <SectionCard
              key={`${name}-${list[0].ownerUid}`}
              title={mine ? `${name} (나)` : name}
              icon={mine ? Music2 : Users}
              description={`${list.length}곡 · ${formatDurationKo(sec)}`}
              action={
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => playAll({ shuffle: false, ids })}
                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-bora-600 transition-colors hover:bg-bora-50 hover:text-bora-700"
                  >
                    <Play className="h-3.5 w-3.5" fill="currentColor" /> 재생
                  </button>
                  <button
                    onClick={() => playAll({ shuffle: true, ids })}
                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-bora-600 transition-colors hover:bg-bora-50 hover:text-bora-700"
                  >
                    <Shuffle className="h-3.5 w-3.5" /> 셔플
                  </button>
                </div>
              }
              bodyClassName="p-0"
            >
              <ul className="divide-y divide-surface-2">
                {list.map((t, i) => (
                  <TrackRow
                    key={t.id}
                    track={t}
                    index={i + 1}
                    contextIds={ids}
                    showPlayCount
                  />
                ))}
              </ul>
            </SectionCard>
          );
        })
      )}
    </div>
  );
}
