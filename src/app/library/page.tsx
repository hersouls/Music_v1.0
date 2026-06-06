"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTracks, useAlbums, useTracksLoading } from "@/contexts/TracksContext";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { useDialogStore } from "@/stores/useDialogStore";
import { useToastStore } from "@/stores/useToastStore";
import { deleteAlbum, setTrackVisibility } from "@/lib/firestore-tracks";
import { formatBytes, formatDurationKo, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import PageHeader from "@/components/ui/PageHeader";
import StatCard from "@/components/ui/StatCard";
import SectionCard from "@/components/ui/SectionCard";
import EmptyState from "@/components/ui/EmptyState";
import TrackRow from "@/components/music/TrackRow";
import UploadTracksModal from "@/components/app/UploadTracksModal";
import AlbumNameModal, {
  type AlbumNameModalState,
} from "@/components/app/AlbumNameModal";
import MoveTrackModal from "@/components/app/MoveTrackModal";
import { fieldInputClass } from "@/components/ui/Form";
import type { Track } from "@/types/music";
import {
  Music2,
  Clock,
  Disc3,
  HardDrive,
  Loader2,
  Pencil,
  Play,
  Plus,
  Shuffle,
  Search,
  ListMusic,
  Trash2,
} from "lucide-react";

/* ───────────────────────────────────────────
   보관함 — 내 트랙 목록 (검색 · 정렬 · 통계 · 앨범 관리)
   앨범 = tracks.album 문자열 그룹 — 곡 업로드/이동에서 새 앨범 생성
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
  const albums = useAlbums();
  const loading = useTracksLoading();
  const playCounts = usePlayerStore((s) => s.playCounts);
  const playAll = usePlayerStore((s) => s.playAll);
  const openDialog = useDialogStore((s) => s.openDialog);
  const addToast = useToastStore((s) => s.addToast);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("title");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [albumModal, setAlbumModal] = useState<AlbumNameModalState | null>(null);
  const [moveTrack, setMoveTrack] = useState<Track | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  // ⌘K "곡 등록" 등 딥링크 — /library?add=1 이면 등록 모달 자동 오픈.
  // searchParams 구독이라 이미 /library 에 있을 때 push 돼도 반응한다 (마운트 1회 아님).
  useEffect(() => {
    if (searchParams.get("add") === "1") {
      setUploadOpen(true);
      router.replace("/library", { scroll: false });
    }
  }, [searchParams, router]);

  const totalSec = useMemo(() => tracks.reduce((s, t) => s + t.duration, 0), [tracks]);
  const totalBytes = useMemo(() => tracks.reduce((s, t) => s + t.sizeBytes, 0), [tracks]);
  const avgSec = tracks.length ? totalSec / tracks.length : 0;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? tracks.filter(
          (t) =>
            t.title.toLowerCase().includes(q) ||
            t.fileName.toLowerCase().includes(q) ||
            t.album.toLowerCase().includes(q)
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

  /* 앨범 그룹 (검색 중이 아닐 때) — 이름순 앨범 + 마지막 "싱글" */
  const albumGroups = useMemo(() => {
    const map = new Map<string, typeof visible>();
    for (const t of visible) {
      const list = map.get(t.album);
      if (list) list.push(t);
      else map.set(t.album, [t]);
    }
    const named = [...map.entries()]
      .filter(([name]) => name !== "")
      .sort((a, b) => a[0].localeCompare(b[0], "ko"))
      .map(([name, list]) => ({ name, list }));
    const root = map.get("");
    return root ? [...named, { name: "", list: root }] : named;
  }, [visible]);

  const singleCount = useMemo(
    () => tracks.filter((t) => !t.album).length,
    [tracks]
  );

  /* 공개/비공개 토글 */
  async function toggleVisibility(track: Track) {
    const next = track.visibility === "private" ? "public" : "private";
    try {
      await setTrackVisibility(track.id, next);
      addToast({
        type: "success",
        message:
          next === "public"
            ? `「${track.title}」을(를) 공개했습니다`
            : `「${track.title}」을(를) 비공개로 전환했습니다`,
      });
    } catch {
      addToast({ type: "error", message: "전환에 실패했습니다" });
    }
  }

  /* 앨범 삭제 — 안의 곡은 싱글로 이동 (문서 id 불변 = 청취 데이터 유지) */
  function confirmDeleteAlbum(name: string, trackCount: number) {
    openDialog({
      title: "앨범 삭제",
      description: `「${name}」 앨범을 삭제합니다. 안의 ${trackCount}곡은 삭제되지 않고 싱글로 이동해요.`,
      confirmLabel: "삭제",
      variant: "danger",
      onConfirm: async () => {
        try {
          await deleteAlbum(tracks, name);
          addToast({
            type: "success",
            message: `앨범 「${name}」을(를) 삭제했습니다`,
          });
        } catch {
          addToast({ type: "error", message: "삭제에 실패했습니다" });
          throw new Error("delete-failed"); // 다이얼로그 유지
        }
      },
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="보관함"
        description={`내 트랙 ${tracks.length}곡 · ${formatDurationKo(totalSec)}`}
        action={{ label: "곡 등록", icon: Plus, onClick: () => setUploadOpen(true) }}
        secondaryAction={{ label: "전체 재생", icon: Play, onClick: () => playAll({ shuffle: false }) }}
      />

      {/* 통계 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="전체 트랙" value={tracks.length} unit="곡" icon={Music2} />
        <StatCard
          label="앨범"
          value={albums.length}
          unit="개"
          icon={Disc3}
          iconClassName="text-amber-600 bg-amber-50"
          sub={singleCount > 0 ? `싱글 ${singleCount}곡 별도` : "곡 등록에서 앨범 생성"}
        />
        <StatCard
          label="총 재생 길이"
          value={formatDurationKo(totalSec)}
          icon={Clock}
          iconClassName="text-indigo-600 bg-indigo-50"
          sub={`평균 ${formatTime(avgSec)}`}
        />
        <StatCard
          label="보관 용량"
          value={formatBytes(totalBytes)}
          icon={HardDrive}
          iconClassName="text-emerald-600 bg-emerald-50"
          sub="원본 기준 (클라우드)"
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
            placeholder="트랙 검색 (제목 · 앨범 · 파일명)"
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
      {loading && tracks.length === 0 ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-bora-500" />
        </div>
      ) : visible.length === 0 ? (
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
            description="곡을 등록하면 클라우드에 보관되고 어디서든 들을 수 있어요."
            action={{ label: "곡 등록", onClick: () => setUploadOpen(true) }}
          />
        )
      ) : query.trim() ? (
        /* 검색 결과 — 앨범 무시 플랫 목록 */
        <SectionCard
          title="검색 결과"
          icon={ListMusic}
          description={`${visible.length}곡 · ${SORT_LABEL[sortKey]}`}
          action={
            <button
              onClick={() => playAll({ shuffle: true, ids: visibleIds })}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-bora-600 transition-colors hover:bg-bora-50 hover:text-bora-700"
            >
              <Shuffle className="h-3.5 w-3.5" /> 셔플
            </button>
          }
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
      ) : (
        /* 앨범 그룹 — SectionCard 별, 마지막에 싱글 */
        albumGroups.map(({ name, list }) => {
          const ids = list.map((t) => t.id);
          const sec = list.reduce((s, t) => s + t.duration, 0);
          return (
            <SectionCard
              key={name || "__singles__"}
              title={name || "싱글"}
              icon={name ? Disc3 : Music2}
              description={`${list.length}곡 · ${formatDurationKo(sec)} · ${SORT_LABEL[sortKey]}`}
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
                  {name && (
                    <AlbumManageButtons
                      onRename={() => setAlbumModal({ mode: "rename", name })}
                      onDelete={() => confirmDeleteAlbum(name, list.length)}
                    />
                  )}
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
                    showAlbum={false}
                    onMove={setMoveTrack}
                    onToggleVisibility={toggleVisibility}
                  />
                ))}
              </ul>
            </SectionCard>
          );
        })
      )}

      <UploadTracksModal open={uploadOpen} onClose={() => setUploadOpen(false)} />
      <AlbumNameModal state={albumModal} onClose={() => setAlbumModal(null)} />
      <MoveTrackModal track={moveTrack} onClose={() => setMoveTrack(null)} />
    </div>
  );
}

/* 앨범 헤더 관리 버튼 — 이름 변경 · 삭제 (컴팩트 아이콘) */
function AlbumManageButtons({
  onRename,
  onDelete,
}: {
  onRename: () => void;
  onDelete: () => void;
}) {
  return (
    <>
      <button
        onClick={onRename}
        aria-label="앨범 이름 변경"
        className="flex h-7 w-7 items-center justify-center rounded-lg text-caption transition-colors hover:bg-surface-tertiary hover:text-body"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={onDelete}
        aria-label="앨범 삭제"
        className="flex h-7 w-7 items-center justify-center rounded-lg text-caption transition-colors hover:bg-red-50 hover:text-red-600"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </>
  );
}
