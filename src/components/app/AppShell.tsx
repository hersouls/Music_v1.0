"use client";

import { Fragment, useState, useEffect, useMemo, useRef } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  Dialog,
  DialogPanel,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import { NAV_ITEMS, type NavItem } from "@/lib/nav";
import { BRAND_NAME, BRAND_NAME_KO } from "@/lib/constants";
import { formatDurationKo } from "@/lib/format";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { TracksProvider, useTracks } from "@/contexts/TracksContext";
import { playerEngine } from "@/lib/player-engine";
import LoginScreen from "@/components/app/LoginScreen";
import CommandPalette from "@/components/app/CommandPalette";
import AudioEngine from "@/components/player/AudioEngine";
import PlayerBar from "@/components/player/PlayerBar";
import NowPlaying from "@/components/player/NowPlaying";
import ToastContainer from "@/components/ui/Toast";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import {
  AudioWaveform,
  Disc3,
  Shuffle,
  Menu,
  X,
  Search,
  LogOut,
} from "lucide-react";

/* ───────────────────────────────────────────
   AppShell — Health v1.0 셸 100% 패리티
   (사이드바 + 모바일 드로어 + ⌘K + 글로벌 플레이어)
   Google 로그인 게이트 → Firestore 트랙 구독 (클라우드 보관함)
   ─────────────────────────────────────────── */

function SidebarContent({
  items,
  pathname,
  onNavigate,
  onOpenSearch,
}: {
  items: NavItem[];
  pathname: string;
  onNavigate?: () => void;
  onOpenSearch?: () => void;
}) {
  const tracks = useTracks();
  const { user, signOut } = useAuth();
  const playAll = usePlayerStore((s) => s.playAll);
  const totalSec = tracks.reduce((s, t) => s + t.duration, 0);

  return (
    <>
      {/* Brand */}
      <div className="flex h-16 items-center gap-2 border-b border-strong px-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-bora-600 shadow-bora-glow">
          <AudioWaveform className="h-5 w-5 text-white" />
        </div>
        <div className="leading-tight">
          <p className="text-base font-bold text-heading">{BRAND_NAME}</p>
          <p className="text-[11px] text-caption">{BRAND_NAME_KO}</p>
        </div>
      </div>

      {/* Search trigger */}
      {onOpenSearch && (
        <div className="flex items-center gap-2 px-3 pt-3">
          <button
            onClick={onOpenSearch}
            className="flex flex-1 items-center gap-2 rounded-xl border border-strong bg-surface-secondary px-3 py-2 text-sm text-caption transition-colors hover:bg-surface-tertiary"
          >
            <Search className="h-4 w-4" aria-hidden="true" />
            <span>검색</span>
            <kbd className="ml-auto rounded border border-strong bg-surface-primary px-1.5 py-0.5 text-[10px] font-medium text-caption">
              ⌘K
            </kbd>
          </button>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1">
          {items.map(({ href, label, icon: Icon }) => {
            const isActive =
              href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  onClick={onNavigate}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-bora-50 text-bora-700"
                      : "text-body hover:bg-surface-secondary"
                  }`}
                >
                  <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                  <span className="flex-1">{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* 보관함 요약 + 셔플 재생 */}
      <div className="border-t border-strong p-3">
        <div className="flex items-center gap-3 rounded-xl px-3 py-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-bora-50 text-bora-600">
            <Disc3 className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-heading">
              보관함 {tracks.length}곡
            </p>
            <p className="truncate text-xs text-caption">
              {formatDurationKo(totalSec)} · 클라우드 보관함
            </p>
          </div>
        </div>
        <button
          onClick={() => {
            playAll({ shuffle: true });
            onNavigate?.();
          }}
          className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-body transition-colors hover:bg-surface-secondary"
        >
          <Shuffle className="h-5 w-5 shrink-0" />
          셔플 재생
        </button>
      </div>

      {/* 계정 — 프로필 + 로그아웃 */}
      <div className="border-t border-strong p-3">
        <div className="flex items-center gap-3 rounded-xl px-3 py-2">
          {user?.photoURL ? (
            <Image
              src={user.photoURL}
              alt=""
              width={36}
              height={36}
              unoptimized
              className="h-9 w-9 shrink-0 rounded-full ring-1 ring-strong"
            />
          ) : (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bora-100 text-sm font-bold text-bora-700">
              {(user?.displayName ?? "?").slice(0, 1)}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-heading">
              {user?.displayName ?? "사용자"}
            </p>
            <p className="truncate text-xs text-caption">{user?.email}</p>
          </div>
          <button
            onClick={() => void signOut()}
            aria-label="로그아웃"
            title="로그아웃"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-caption transition-colors hover:bg-surface-tertiary hover:text-body"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const currentId = usePlayerStore((s) => s.currentId);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // ⌘K / Ctrl+K 전역 검색 토글
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const openSearch = () => {
    setMobileOpen(false);
    setPaletteOpen(true);
  };

  // 플레이어 바 노출 시 본문 하단 여백 확보
  const mainPadding = useMemo(
    () =>
      currentId
        ? "p-4 pt-18 pb-28 lg:p-8 lg:pt-8 lg:pb-32"
        : "p-4 pt-18 lg:p-8 lg:pt-8",
    [currentId]
  );

  return (
    <div className="flex min-h-dvh bg-surface-secondary">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-64 flex-col border-r border-strong bg-surface-primary">
        <SidebarContent
          items={NAV_ITEMS}
          pathname={pathname}
          onOpenSearch={openSearch}
        />
      </aside>

      {/* Mobile Header */}
      <div className="fixed top-0 left-0 right-0 z-40 flex lg:hidden h-14 items-center justify-between border-b border-strong bg-surface-primary px-4">
        <button
          onClick={() => setMobileOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-surface-tertiary"
          aria-label="메뉴 열기"
        >
          <Menu className="h-5 w-5 text-heading" />
        </button>
        <div className="flex items-center gap-1.5">
          <AudioWaveform className="h-4 w-4 text-bora-600" />
          <span className="text-sm font-bold text-heading">{BRAND_NAME}</span>
        </div>
        <button
          onClick={openSearch}
          className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-surface-tertiary"
          aria-label="검색"
        >
          <Search className="h-5 w-5 text-body" />
        </button>
      </div>

      {/* Mobile Drawer (Headless UI Dialog — 포커스 트랩·Esc·포커스 복귀 자동) */}
      <Transition show={mobileOpen} as={Fragment}>
        <Dialog
          onClose={() => setMobileOpen(false)}
          className="relative z-50 lg:hidden"
        >
          <TransitionChild
            as={Fragment}
            enter="ease-out duration-200"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-150"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
          </TransitionChild>
          <TransitionChild
            as={Fragment}
            enter="ease-out duration-200"
            enterFrom="-translate-x-full"
            enterTo="translate-x-0"
            leave="ease-in duration-150"
            leaveFrom="translate-x-0"
            leaveTo="-translate-x-full"
          >
            <DialogPanel
              aria-label="메뉴"
              className="fixed left-0 top-0 bottom-0 flex w-64 flex-col bg-surface-primary shadow-xl"
            >
              <div className="absolute top-3 right-3 z-10">
                <button
                  onClick={() => setMobileOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-surface-tertiary"
                  aria-label="메뉴 닫기"
                >
                  <X className="h-4 w-4 text-body" />
                </button>
              </div>
              <SidebarContent
                items={NAV_ITEMS}
                pathname={pathname}
                onOpenSearch={openSearch}
                onNavigate={() => setMobileOpen(false)}
              />
            </DialogPanel>
          </TransitionChild>
        </Dialog>
      </Transition>

      {/* Content */}
      <main className={`flex-1 overflow-x-hidden ${mainPadding}`}>
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>

      {/* Global UI */}
      <AudioEngine />
      <PlayerBar />
      <NowPlaying />
      <ToastContainer />
      <ConfirmDialog />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}

/* 인증 해석 중 스플래시 — np-hero 그라데이션 (로그인 화면과 톤 일치) */
function SplashScreen() {
  return (
    <div className="np-hero flex min-h-dvh items-center justify-center">
      <div className="flex h-16 w-16 animate-pulse items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25 backdrop-blur-sm">
        <AudioWaveform className="h-8 w-8 text-white" />
      </div>
    </div>
  );
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, uid, loading, firebaseReady } = useAuth();
  const pathname = usePathname();

  /* 로그아웃 시 재생·청취 상태 정리 — 다른 계정 데이터와 섞이지 않게 */
  const prevUid = useRef<string | null>(null);
  useEffect(() => {
    if (prevUid.current && !uid) {
      playerEngine.pause();
      usePlayerStore.setState({
        tracks: [],
        currentId: null,
        queue: [],
        baseQueue: [],
        isPlaying: false,
        currentTime: 0,
        duration: 0,
        favorites: [],
        playCounts: {},
        recentPlays: [],
        lastTrackId: null,
        nowPlayingOpen: false,
      });
    }
    prevUid.current = uid;
  }, [uid]);

  // 공개 곡 공유 페이지(/track/[id])는 로그인 없이 단독 렌더 — 자체 플레이어 보유
  if (pathname?.startsWith("/track/")) return <>{children}</>;

  if (!firebaseReady) return <LoginScreen />; // 설정 안내 표시
  if (loading) return <SplashScreen />;
  if (!user) return <LoginScreen />;

  return (
    <TracksProvider>
      <Shell>{children}</Shell>
    </TracksProvider>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AuthGate>{children}</AuthGate>
    </AuthProvider>
  );
}
