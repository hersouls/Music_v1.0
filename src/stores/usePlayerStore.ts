import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { playerEngine } from "@/lib/player-engine";
import type { Track, RepeatMode, PlayEvent } from "@/types/music";

/* ───────────────────────────────────────────
   플레이어 스토어 — 재생 상태(휘발) + 청취 데이터(영속)
   영속: favorites · playCounts · recentPlays · volume ·
         muted · shuffle · repeat · lastTrackId
   SSR 하이드레이션 불일치 방지를 위해 skipHydration —
   AudioEngine 마운트 시 수동 rehydrate.
   ─────────────────────────────────────────── */

const RECENT_CAP = 300;

function shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

interface PlayerState {
  /* 트랙 데이터 (서버에서 시드) */
  tracks: Track[];

  /* 재생 상태 */
  currentId: string | null;
  queue: string[];
  /** 큐의 소스 컨텍스트(셔플 전 원래 순서) — 셔플 토글 시 멤버십·순서 복원용 */
  baseQueue: string[];
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  nowPlayingOpen: boolean;
  hydrated: boolean;

  /* 청취 데이터 (영속) */
  favorites: string[];
  playCounts: Record<string, number>;
  recentPlays: PlayEvent[];
  lastTrackId: string | null;

  /* 액션 */
  setTracks: (tracks: Track[]) => void;
  playTrack: (id: string, contextIds?: string[]) => void;
  playAll: (opts?: { shuffle?: boolean; ids?: string[] }) => void;
  /** 현재 큐를 유지한 채 큐 안의 다른 곡으로 점프 (NowPlaying 다음 트랙 등) */
  playFromQueue: (id: string) => void;
  toggle: () => void;
  next: () => void;
  prev: () => void;
  seek: (t: number) => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  toggleFavorite: (id: string) => void;
  setNowPlayingOpen: (open: boolean) => void;
  resetStats: () => void;

  /* 내부 — 엔진 이벤트 배선용 */
  _advance: (dir: 1 | -1, opts: { auto: boolean }) => void;
  _registerPlay: (id: string) => void;
  _onTime: (t: number) => void;
  _onDuration: (d: number) => void;
  _onEnded: () => void;
  _onPlayState: (p: boolean) => void;
  _setHydrated: () => void;
}

function startTrack(
  get: () => PlayerState,
  set: (partial: Partial<PlayerState>) => void,
  id: string,
  queue: string[],
  baseQueue?: string[]
) {
  const track = get().tracks.find((t) => t.id === id);
  if (!track) return;
  set({
    currentId: id,
    queue,
    ...(baseQueue ? { baseQueue } : {}),
    currentTime: 0,
    duration: track.duration || 0,
    lastTrackId: id,
  });
  get()._registerPlay(id);
  playerEngine.load(track.src, true);
}

export const usePlayerStore = create<PlayerState>()(
  persist(
    (set, get) => ({
      tracks: [],

      currentId: null,
      queue: [],
      baseQueue: [],
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      volume: 0.8,
      muted: false,
      shuffle: false,
      repeat: "off",
      nowPlayingOpen: false,
      hydrated: false,

      favorites: [],
      playCounts: {},
      recentPlays: [],
      lastTrackId: null,

      setTracks: (tracks) =>
        set((s) => {
          const exists = (id: string) => tracks.some((t) => t.id === id);
          return {
            tracks,
            queue: s.queue.length
              ? s.queue.filter(exists)
              : tracks.map((t) => t.id),
            baseQueue: s.baseQueue.length
              ? s.baseQueue.filter(exists)
              : tracks.map((t) => t.id),
          };
        }),

      playTrack: (id, contextIds) => {
        const { tracks, shuffle } = get();
        const base =
          contextIds && contextIds.length
            ? contextIds
            : tracks.map((t) => t.id);
        if (!base.includes(id)) return;
        const queue = shuffle
          ? [id, ...shuffled(base.filter((x) => x !== id))]
          : base;
        startTrack(get, set, id, queue, base);
      },

      playAll: (opts = {}) => {
        const { tracks } = get();
        const base =
          opts.ids && opts.ids.length ? opts.ids : tracks.map((t) => t.id);
        if (!base.length) return;
        const useShuffle = opts.shuffle ?? get().shuffle;
        if (opts.shuffle !== undefined) set({ shuffle: opts.shuffle });
        const queue = useShuffle ? shuffled(base) : base;
        startTrack(get, set, queue[0], queue, base);
      },

      playFromQueue: (id) => {
        // 큐·컨텍스트는 그대로 두고 재생 위치만 점프
        if (!get().queue.includes(id)) {
          get().playTrack(id);
          return;
        }
        const track = get().tracks.find((t) => t.id === id);
        if (!track) return;
        set({
          currentId: id,
          currentTime: 0,
          duration: track.duration || 0,
          lastTrackId: id,
        });
        get()._registerPlay(id);
        playerEngine.load(track.src, true);
      },

      toggle: () => {
        const { currentId, isPlaying, lastTrackId, tracks } = get();
        if (!currentId) {
          // 아직 시작 전 — 마지막으로 듣던 곡(없으면 첫 곡)부터
          const target =
            lastTrackId && tracks.some((t) => t.id === lastTrackId)
              ? lastTrackId
              : tracks[0]?.id;
          if (target) get().playTrack(target);
          return;
        }
        if (isPlaying) playerEngine.pause();
        else void playerEngine.play();
      },

      next: () => get()._advance(1, { auto: false }),

      prev: () => {
        // 3초 이상 재생 중이면 곡 처음으로 (표준 플레이어 관례)
        if (get().currentTime > 3) {
          playerEngine.seek(0);
          set({ currentTime: 0 });
          return;
        }
        get()._advance(-1, { auto: false });
      },

      seek: (t) => {
        playerEngine.seek(t);
        set({ currentTime: t });
      },

      setVolume: (v) => {
        const vol = Math.min(1, Math.max(0, v));
        playerEngine.setVolume(vol);
        if (get().muted && vol > 0) {
          playerEngine.setMuted(false);
          set({ volume: vol, muted: false });
        } else {
          set({ volume: vol });
        }
      },

      toggleMute: () => {
        const muted = !get().muted;
        playerEngine.setMuted(muted);
        set({ muted });
      },

      toggleShuffle: () => {
        // 큐 멤버십(소스 컨텍스트)을 보존한 채 순서만 섞고/복원한다
        const { shuffle, currentId, tracks, baseQueue } = get();
        const members = baseQueue.length ? baseQueue : tracks.map((t) => t.id);
        if (!shuffle) {
          set({
            shuffle: true,
            queue:
              currentId && members.includes(currentId)
                ? [currentId, ...shuffled(members.filter((x) => x !== currentId))]
                : shuffled(members),
          });
        } else {
          set({ shuffle: false, queue: members });
        }
      },

      cycleRepeat: () =>
        set((s) => ({
          repeat: s.repeat === "off" ? "all" : s.repeat === "all" ? "one" : "off",
        })),

      toggleFavorite: (id) =>
        set((s) => ({
          favorites: s.favorites.includes(id)
            ? s.favorites.filter((f) => f !== id)
            : [...s.favorites, id],
        })),

      setNowPlayingOpen: (open) => set({ nowPlayingOpen: open }),

      resetStats: () => set({ playCounts: {}, recentPlays: [] }),

      _advance: (dir, { auto }) => {
        const { queue, currentId, repeat } = get();
        if (!queue.length) return;
        const i = currentId ? queue.indexOf(currentId) : -1;
        let nextIndex = i + dir;
        if (nextIndex < 0) nextIndex = queue.length - 1;
        if (nextIndex >= queue.length) {
          if (auto && repeat !== "all") {
            // 자동 진행 끝 — 정지 (repeat off)
            playerEngine.pause();
            playerEngine.seek(0);
            set({ currentTime: 0 });
            return;
          }
          nextIndex = 0;
        }
        startTrack(get, set, queue[nextIndex], queue);
      },

      _registerPlay: (id) =>
        set((s) => ({
          playCounts: { ...s.playCounts, [id]: (s.playCounts[id] ?? 0) + 1 },
          recentPlays: [
            { id, at: new Date().toISOString() },
            ...s.recentPlays,
          ].slice(0, RECENT_CAP),
        })),

      _onTime: (t) => set({ currentTime: t }),
      _onDuration: (d) => {
        if (Number.isFinite(d) && d > 0) set({ duration: d });
      },
      _onEnded: () => {
        if (get().repeat === "one") {
          playerEngine.seek(0);
          void playerEngine.play();
          return;
        }
        get()._advance(1, { auto: true });
      },
      _onPlayState: (p) => set({ isPlaying: p }),
      _setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "moonwave-music-player",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: (s) => ({
        favorites: s.favorites,
        playCounts: s.playCounts,
        recentPlays: s.recentPlays,
        volume: s.volume,
        muted: s.muted,
        shuffle: s.shuffle,
        repeat: s.repeat,
        lastTrackId: s.lastTrackId,
      }),
    }
  )
);
