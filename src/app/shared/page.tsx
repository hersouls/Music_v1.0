"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useSharedLibraries } from "@/contexts/TracksContext";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { formatDurationKo } from "@/lib/format";
import PageHeader from "@/components/ui/PageHeader";
import StatCard from "@/components/ui/StatCard";
import SectionCard from "@/components/ui/SectionCard";
import EmptyState from "@/components/ui/EmptyState";
import TrackRow from "@/components/music/TrackRow";
import { Users, Music2, Play, Shuffle, Ticket, Disc3 } from "lucide-react";

/* ───────────────────────────────────────────
   공유 보관함 — 초대 코드로 권한 받은 소유자들의 모든 곡
   (비공개 포함). 소유자별 그룹·전체/셔플 재생.
   ─────────────────────────────────────────── */

export default function SharedPage() {
  const router = useRouter();
  const libraries = useSharedLibraries();
  const playAll = usePlayerStore((s) => s.playAll);

  const allIds = useMemo(
    () => libraries.flatMap((l) => l.tracks.map((t) => t.id)),
    [libraries]
  );
  const totalSec = useMemo(
    () =>
      libraries.reduce(
        (s, l) => s + l.tracks.reduce((x, t) => x + t.duration, 0),
        0
      ),
    [libraries]
  );
  const totalTracks = allIds.length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="공유 보관함"
        description={
          totalTracks
            ? `${libraries.length}명이 공유한 ${totalTracks}곡 · ${formatDurationKo(totalSec)}`
            : "초대 코드로 다른 사람의 음악을 모두 들어보세요"
        }
        action={
          totalTracks
            ? {
                label: "전체 재생",
                icon: Play,
                onClick: () => playAll({ shuffle: false, ids: allIds }),
              }
            : undefined
        }
        secondaryAction={
          totalTracks > 1
            ? {
                label: "셔플",
                icon: Shuffle,
                onClick: () => playAll({ shuffle: true, ids: allIds }),
              }
            : undefined
        }
      />

      {totalTracks === 0 ? (
        <EmptyState
          icon={Ticket}
          title="아직 공유받은 음악이 없어요"
          description="받은 초대 코드를 설정에서 입력하면, 그 사람의 모든 곡을 여기서 들을 수 있어요."
          action={{ label: "초대 코드 입력", onClick: () => router.push("/settings") }}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard label="공유한 사람" value={libraries.length} unit="명" icon={Users} />
            <StatCard
              label="전체 곡"
              value={totalTracks}
              unit="곡"
              icon={Music2}
              iconClassName="text-indigo-600 bg-indigo-50"
            />
            <StatCard
              label="총 재생 길이"
              value={formatDurationKo(totalSec)}
              icon={Disc3}
              iconClassName="text-emerald-600 bg-emerald-50"
            />
          </div>

          {libraries.map((lib) => {
            const ids = lib.tracks.map((t) => t.id);
            const sec = lib.tracks.reduce((s, t) => s + t.duration, 0);
            return (
              <SectionCard
                key={lib.ownerUid}
                title={`${lib.ownerName}님의 음악`}
                icon={Users}
                description={`${lib.tracks.length}곡 · ${formatDurationKo(sec)}`}
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
                  {lib.tracks.map((t, i) => (
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
          })}
        </>
      )}
    </div>
  );
}
