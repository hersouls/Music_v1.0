"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  subscribeMyTracks,
  subscribePublicTracks,
} from "@/lib/firestore-tracks";
import { startListeningSync, stopListeningSync } from "@/lib/listening-sync";
import { usePlayerStore } from "@/stores/usePlayerStore";
import type { Track } from "@/types/music";

/* Firestore 실시간 구독으로 트랙을 제공 —
   내 곡(useTracks)·공개 곡(usePublicTracks)을 분리 제공하고,
   재생 큐 탐색용으로 스토어에는 합집합(내 곡 우선)을 시드한다.
   청취 데이터(즐겨찾기·재생수)는 로그인 동안 Firestore 와 동기화. */

interface LibraryData {
  /** 내 곡 (보관함·홈·통계) */
  tracks: Track[];
  /** 공개 곡 전체 (둘러보기) */
  publicTracks: Track[];
  /** 내 곡에서 파생된 앨범 목록 (이름순) */
  albums: string[];
  /** 첫 스냅샷 수신 전 */
  loading: boolean;
}

const TracksContext = createContext<LibraryData>({
  tracks: [],
  publicTracks: [],
  albums: [],
  loading: true,
});

export function useTracks(): Track[] {
  return useContext(TracksContext).tracks;
}

export function usePublicTracks(): Track[] {
  return useContext(TracksContext).publicTracks;
}

export function useAlbums(): string[] {
  return useContext(TracksContext).albums;
}

export function useTracksLoading(): boolean {
  return useContext(TracksContext).loading;
}

export function TracksProvider({ children }: { children: React.ReactNode }) {
  const { uid } = useAuth();
  const [myTracks, setMyTracks] = useState<Track[] | null>(null);
  const [publicTracks, setPublicTracks] = useState<Track[]>([]);
  const setTracks = usePlayerStore((s) => s.setTracks);

  /* 내 곡 구독 */
  useEffect(() => {
    if (!uid) return;
    const unsub = subscribeMyTracks(uid, setMyTracks, () => setMyTracks([]));
    return () => {
      unsub();
      setMyTracks(null);
    };
  }, [uid]);

  /* 공개 곡 구독 (둘러보기 + 공개 곡 재생) */
  useEffect(() => {
    if (!uid) return;
    const unsub = subscribePublicTracks(setPublicTracks, () =>
      setPublicTracks([])
    );
    return () => {
      unsub();
      setPublicTracks([]);
    };
  }, [uid]);

  /* 청취 데이터 동기화 — 로그인 동안 */
  useEffect(() => {
    if (!uid) return;
    startListeningSync(uid);
    return () => stopListeningSync();
  }, [uid]);

  /* 스토어 시드 — 내 곡 + 공개 곡 합집합 (재생 큐·탐색용, 내 곡 우선) */
  useEffect(() => {
    const mine = myTracks ?? [];
    const seen = new Set(mine.map((t) => t.id));
    setTracks([...mine, ...publicTracks.filter((t) => !seen.has(t.id))]);
  }, [myTracks, publicTracks, setTracks]);

  const albums = useMemo(() => {
    const names = new Set<string>();
    for (const t of myTracks ?? []) if (t.album) names.add(t.album);
    return [...names].sort((a, b) => a.localeCompare(b, "ko"));
  }, [myTracks]);

  const value = useMemo<LibraryData>(
    () => ({
      tracks: myTracks ?? [],
      publicTracks,
      albums,
      loading: myTracks === null,
    }),
    [myTracks, publicTracks, albums]
  );

  return (
    <TracksContext.Provider value={value}>{children}</TracksContext.Provider>
  );
}
