"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useTracks } from "@/contexts/TracksContext";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { formatDurationKo } from "@/lib/format";
import PageHeader from "@/components/ui/PageHeader";
import SectionCard from "@/components/ui/SectionCard";
import EmptyState from "@/components/ui/EmptyState";
import TrackRow from "@/components/music/TrackRow";
import { Heart, Play, Shuffle } from "lucide-react";

/* ───────────────────────────────────────────
   즐겨찾기 — 하트 표시한 곡 모음 (즐겨찾기만 큐로 재생)
   ─────────────────────────────────────────── */

export default function FavoritesPage() {
  const router = useRouter();
  const tracks = useTracks();
  const favorites = usePlayerStore((s) => s.favorites);
  const playAll = usePlayerStore((s) => s.playAll);

  const favTracks = useMemo(
    () => tracks.filter((t) => favorites.includes(t.id)),
    [tracks, favorites]
  );
  const favIds = useMemo(() => favTracks.map((t) => t.id), [favTracks]);
  const totalSec = useMemo(
    () => favTracks.reduce((s, t) => s + t.duration, 0),
    [favTracks]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="즐겨찾기"
        description={
          favTracks.length
            ? `좋아요 표시한 ${favTracks.length}곡 · ${formatDurationKo(totalSec)}`
            : "좋아하는 곡을 하트로 모아보세요"
        }
        action={
          favTracks.length
            ? {
                label: "전체 재생",
                icon: Play,
                onClick: () => playAll({ shuffle: false, ids: favIds }),
              }
            : undefined
        }
        secondaryAction={
          favTracks.length > 1
            ? {
                label: "셔플",
                icon: Shuffle,
                onClick: () => playAll({ shuffle: true, ids: favIds }),
              }
            : undefined
        }
      />

      {favTracks.length === 0 ? (
        <EmptyState
          icon={Heart}
          title="아직 즐겨찾기한 곡이 없습니다"
          description="트랙 목록에서 하트를 누르면 이곳에 모여요. 재생 중 키보드 F 로도 추가할 수 있습니다."
          action={{ label: "보관함 둘러보기", onClick: () => router.push("/library") }}
        />
      ) : (
        <SectionCard
          title="즐겨찾기 트랙"
          icon={Heart}
          description={`${favTracks.length}곡`}
          bodyClassName="p-0"
        >
          <ul className="divide-y divide-surface-2">
            {favTracks.map((t, i) => (
              <TrackRow
                key={t.id}
                track={t}
                index={i + 1}
                contextIds={favIds}
                showPlayCount
              />
            ))}
          </ul>
        </SectionCard>
      )}
    </div>
  );
}
