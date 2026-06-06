"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogPanel,
  Combobox,
  ComboboxInput,
  ComboboxOptions,
  ComboboxOption,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import { useTracks } from "@/contexts/TracksContext";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { NAV_ITEMS } from "@/lib/nav";
import { formatTime } from "@/lib/format";
import {
  Search,
  Music2,
  Play,
  Plus,
  FolderPlus,
  Shuffle,
  ArrowRight,
  CornerDownLeft,
  type LucideIcon,
} from "lucide-react";

/* ───────────────────────────────────────────
   CommandPalette — ⌘K 전역 검색 (Health 패리티 셸)
   그룹: 바로 이동(nav) · 빠른 작업(action) · 트랙(track)
   트랙 선택 시 즉시 재생.
   ─────────────────────────────────────────── */

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

type Kind = "nav" | "action" | "track";

interface Result {
  key: string;
  kind: Kind;
  title: string;
  subtitle: string;
  haystack: string;
  run: () => void;
}

const GROUP_META: Record<Kind, { label: string; Icon: LucideIcon }> = {
  nav: { label: "바로 이동", Icon: ArrowRight },
  action: { label: "빠른 작업", Icon: Play },
  track: { label: "트랙", Icon: Music2 },
};

function hay(...parts: (string | undefined | null)[]): string {
  return parts.filter(Boolean).join(" ").toLowerCase();
}

export default function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const router = useRouter();
  const tracks = useTracks();
  const playTrack = usePlayerStore((s) => s.playTrack);
  const playAll = usePlayerStore((s) => s.playAll);
  const [query, setQuery] = useState("");

  const all = useMemo<Result[]>(() => {
    const out: Result[] = [];

    for (const item of NAV_ITEMS) {
      out.push({
        key: `nav-${item.href}`,
        kind: "nav",
        title: item.label,
        subtitle: item.desc,
        haystack: hay(item.label, item.desc, item.href),
        run: () => router.push(item.href),
      });
    }

    out.push({
      key: "action-play-all",
      kind: "action",
      title: "전체 재생",
      subtitle: `보관함 ${tracks.length}곡을 순서대로 재생`,
      haystack: hay("전체 재생", "play all", "재생"),
      run: () => playAll({ shuffle: false }),
    });
    out.push({
      key: "action-shuffle",
      kind: "action",
      title: "셔플 재생",
      subtitle: "보관함을 무작위로 재생",
      haystack: hay("셔플 재생", "셔플", "shuffle", "랜덤"),
      run: () => playAll({ shuffle: true }),
    });
    out.push({
      key: "action-add-tracks",
      kind: "action",
      title: "곡 등록",
      subtitle: "오디오 파일을 보관함에 추가",
      haystack: hay("곡 등록", "업로드", "추가", "upload", "add"),
      run: () => router.push("/library?add=1"),
    });
    out.push({
      key: "action-create-album",
      kind: "action",
      title: "새 앨범 만들기",
      subtitle: "보관함의 곡을 골라 앨범으로 묶기",
      haystack: hay("새 앨범 만들기", "앨범 생성", "앨범 추가", "album", "create"),
      run: () => router.push("/library?album=new"),
    });

    for (const t of tracks) {
      out.push({
        key: `track-${t.id}`,
        kind: "track",
        title: t.title,
        subtitle: `${t.artist}${t.album ? ` · ${t.album}` : ""} · ${formatTime(t.duration)}`,
        haystack: hay(t.title, t.fileName, t.album, t.artist),
        run: () => playTrack(t.id),
      });
    }
    return out;
  }, [tracks, router, playAll, playTrack]);

  const q = query.trim().toLowerCase();
  const groups = useMemo(() => {
    const matched = q ? all.filter((r) => r.haystack.includes(q)) : all;
    const order: Kind[] = q ? ["track", "action", "nav"] : ["nav", "action", "track"];
    const cap = (kind: Kind) => (kind === "track" ? (q ? 8 : 5) : 8);
    return order
      .map((kind) => ({
        kind,
        items: matched.filter((r) => r.kind === kind).slice(0, cap(kind)),
      }))
      .filter((g) => g.items.length > 0);
  }, [all, q]);

  const totalShown = groups.reduce((s, g) => s + g.items.length, 0);

  function handleSelect(r: Result | null) {
    if (!r) return;
    r.run();
    setQuery("");
    onClose();
  }

  return (
    <Transition show={open} as={Fragment} afterLeave={() => setQuery("")}>
      <Dialog onClose={onClose} className="relative z-[60]">
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/40" />
        </TransitionChild>

        <div className="fixed inset-0 flex items-start justify-center p-4 pt-[10vh]">
          <TransitionChild
            as={Fragment}
            enter="ease-out duration-200"
            enterFrom="opacity-0 scale-95"
            enterTo="opacity-100 scale-100"
            leave="ease-in duration-150"
            leaveFrom="opacity-100 scale-100"
            leaveTo="opacity-0 scale-95"
          >
            <DialogPanel className="w-full max-w-xl overflow-hidden rounded-2xl border border-strong bg-surface-primary shadow-xl">
              <Combobox onChange={handleSelect}>
                {/* 검색 입력 */}
                <div className="flex items-center gap-2.5 border-b border-base px-4">
                  <Search className="h-4 w-4 shrink-0 text-caption" aria-hidden="true" />
                  <ComboboxInput
                    autoFocus
                    className="w-full bg-transparent py-3.5 text-sm text-heading placeholder:text-caption outline-none"
                    placeholder="트랙 검색 또는 이동…"
                    onChange={(e) => setQuery(e.target.value)}
                    aria-label="전역 검색"
                  />
                </div>

                <ComboboxOptions static className="max-h-[60vh] overflow-y-auto p-2">
                  {totalShown === 0 ? (
                    <div className="px-3 py-10 text-center text-sm text-caption">
                      {q ? `“${query.trim()}” 검색 결과가 없습니다` : "검색어를 입력하세요"}
                    </div>
                  ) : (
                    groups.map((group) => {
                      const Icon = GROUP_META[group.kind].Icon;
                      return (
                        <div key={group.kind} className="mb-1 last:mb-0">
                          <p className="flex items-center gap-1.5 px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-caption">
                            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                            {GROUP_META[group.kind].label}
                          </p>
                          {group.items.map((r) => {
                            const ItemIcon =
                              r.key === "action-shuffle"
                                ? Shuffle
                                : r.key === "action-add-tracks"
                                  ? Plus
                                  : r.key === "action-create-album"
                                    ? FolderPlus
                                    : Icon;
                            return (
                              <ComboboxOption key={r.key} value={r} as={Fragment}>
                                {({ active }) => (
                                  <li
                                    className={
                                      "flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 " +
                                      (active ? "bg-bora-50" : "")
                                    }
                                  >
                                    <span
                                      className={
                                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg " +
                                        (active
                                          ? "bg-bora-600 text-white"
                                          : "bg-surface-secondary text-bora-600")
                                      }
                                    >
                                      <ItemIcon className="h-4 w-4" aria-hidden="true" />
                                    </span>
                                    <span className="min-w-0 flex-1">
                                      <span className="block truncate text-sm font-medium text-heading">
                                        {r.title}
                                      </span>
                                      <span className="block truncate text-xs text-caption">
                                        {r.subtitle}
                                      </span>
                                    </span>
                                    {active && (
                                      <CornerDownLeft
                                        className="h-3.5 w-3.5 shrink-0 text-bora-500"
                                        aria-hidden="true"
                                      />
                                    )}
                                  </li>
                                )}
                              </ComboboxOption>
                            );
                          })}
                        </div>
                      );
                    })
                  )}
                </ComboboxOptions>

                {/* 푸터 힌트 */}
                <div className="flex items-center justify-between gap-2 border-t border-base px-4 py-2 text-[11px] text-caption">
                  <span>↑↓ 이동 · ↵ 재생/열기 · esc 닫기</span>
                  <span className="hidden sm:inline">⌘/Ctrl + K</span>
                </div>
              </Combobox>
            </DialogPanel>
          </TransitionChild>
        </div>
      </Dialog>
    </Transition>
  );
}
