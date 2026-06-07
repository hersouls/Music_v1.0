"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  subscribeMyTracks,
  subscribePublicTracks,
} from "@/lib/firestore-tracks";
import {
  subscribeMyGrants,
  subscribeOwnerTracks,
  type Grant,
} from "@/lib/invites";
import { startListeningSync, stopListeningSync } from "@/lib/listening-sync";
import { usePlayerStore } from "@/stores/usePlayerStore";
import type { Track } from "@/types/music";

/* Firestore 실시간 구독으로 트랙을 제공 —
   내 곡(useTracks)·공개 곡(usePublicTracks)·초대로 공유받은 곡(useSharedLibraries)을
   제공하고, 재생 큐 탐색용으로 스토어에는 합집합(내 곡 우선)을 시드한다. */

/** 초대로 공유받은 한 소유자의 라이브러리 */
export interface SharedLibrary {
  ownerUid: string;
  ownerName: string;
  tracks: Track[];
}

interface LibraryData {
  tracks: Track[];
  publicTracks: Track[];
  sharedLibraries: SharedLibrary[];
  albums: string[];
  loading: boolean;
}

const TracksContext = createContext<LibraryData>({
  tracks: [],
  publicTracks: [],
  sharedLibraries: [],
  albums: [],
  loading: true,
});

export function useTracks(): Track[] {
  return useContext(TracksContext).tracks;
}

export function usePublicTracks(): Track[] {
  return useContext(TracksContext).publicTracks;
}

export function useSharedLibraries(): SharedLibrary[] {
  return useContext(TracksContext).sharedLibraries;
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
  const [publicLoaded, setPublicLoaded] = useState(false);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [sharedByOwner, setSharedByOwner] = useState<Record<string, Track[]>>({});
  const setTracks = usePlayerStore((s) => s.setTracks);

  /* 내 곡 구독 (로그인 시) */
  useEffect(() => {
    if (!uid) {
      setMyTracks(null);
      return;
    }
    const unsub = subscribeMyTracks(uid, setMyTracks, () => setMyTracks([]));
    return () => {
      unsub();
      setMyTracks(null);
    };
  }, [uid]);

  /* 공개 곡 구독 — 로그인 없이도 (둘러보기·익명 청취) */
  useEffect(() => {
    const apply = (tracks: Track[]) => {
      setPublicTracks(tracks);
      setPublicLoaded(true);
    };
    const unsub = subscribePublicTracks(apply, () => apply([]));
    return () => {
      unsub();
      setPublicTracks([]);
      setPublicLoaded(false);
    };
  }, []);

  /* 내가 수락한 권한(grant) 구독 */
  useEffect(() => {
    if (!uid) return;
    const unsub = subscribeMyGrants(uid, setGrants, () => setGrants([]));
    return () => {
      unsub();
      setGrants([]);
    };
  }, [uid]);

  /* 권한 받은 각 소유자의 트랙 구독 (grant 목록 변동 시 재배선) */
  const grantKey = useMemo(
    () => grants.map((g) => g.ownerUid).sort().join(","),
    [grants]
  );
  const grantNames = useRef<Record<string, string>>({});
  useEffect(() => {
    grantNames.current = Object.fromEntries(
      grants.map((g) => [g.ownerUid, g.ownerName])
    );
  }, [grants]);

  useEffect(() => {
    if (!uid) return;
    const ownerUids = grantKey ? grantKey.split(",") : [];
    if (!ownerUids.length) {
      setSharedByOwner({});
      return;
    }
    const unsubs = ownerUids.map((ownerUid) =>
      subscribeOwnerTracks(
        ownerUid,
        (tracks) => setSharedByOwner((prev) => ({ ...prev, [ownerUid]: tracks })),
        () => setSharedByOwner((prev) => ({ ...prev, [ownerUid]: [] }))
      )
    );
    return () => {
      unsubs.forEach((u) => u());
      setSharedByOwner({});
    };
  }, [uid, grantKey]);

  /* 청취 데이터 동기화 — 로그인 동안 */
  useEffect(() => {
    if (!uid) return;
    startListeningSync(uid);
    return () => stopListeningSync();
  }, [uid]);

  const sharedLibraries = useMemo<SharedLibrary[]>(() => {
    return grants
      .map((g) => ({
        ownerUid: g.ownerUid,
        ownerName: g.ownerName || grantNames.current[g.ownerUid] || "공유한 사람",
        tracks: sharedByOwner[g.ownerUid] ?? [],
      }))
      .filter((lib) => lib.tracks.length > 0);
  }, [grants, sharedByOwner]);

  /* 스토어 시드 — 내 곡 + 공개 곡 + 공유받은 곡 합집합 (재생 큐·탐색용) */
  useEffect(() => {
    const mine = myTracks ?? [];
    const seen = new Set(mine.map((t) => t.id));
    const merged = [...mine];
    for (const t of publicTracks) if (!seen.has(t.id)) (seen.add(t.id), merged.push(t));
    for (const lib of sharedLibraries)
      for (const t of lib.tracks) if (!seen.has(t.id)) (seen.add(t.id), merged.push(t));
    setTracks(merged);
  }, [myTracks, publicTracks, sharedLibraries, setTracks]);

  /* useTracks() 의 주 목록 — 로그인: 내 곡 / 비로그인: 공개 카탈로그 */
  const primaryTracks = useMemo(
    () => (uid ? myTracks ?? [] : publicTracks),
    [uid, myTracks, publicTracks]
  );

  const albums = useMemo(() => {
    const names = new Set<string>();
    for (const t of primaryTracks) if (t.album) names.add(t.album);
    return [...names].sort((a, b) => a.localeCompare(b, "ko"));
  }, [primaryTracks]);

  const value = useMemo<LibraryData>(
    () => ({
      tracks: primaryTracks,
      publicTracks,
      sharedLibraries,
      albums,
      loading: uid ? myTracks === null : !publicLoaded,
    }),
    [uid, primaryTracks, publicTracks, sharedLibraries, albums, myTracks, publicLoaded]
  );

  return (
    <TracksContext.Provider value={value}>{children}</TracksContext.Provider>
  );
}
