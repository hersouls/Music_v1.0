"use client";

import { createContext, useContext, useEffect } from "react";
import { usePlayerStore } from "@/stores/usePlayerStore";
import type { Track } from "@/types/music";

/* 서버(layout)에서 스캔한 트랙 목록을 동기적으로 제공 —
   첫 렌더부터 목록이 보이고(깜빡임 없음), 스토어에는
   effect 로 시드해 재생 큐·탐색에 사용한다. */

const TracksContext = createContext<Track[]>([]);

export function useTracks(): Track[] {
  return useContext(TracksContext);
}

export function TracksProvider({
  tracks,
  children,
}: {
  tracks: Track[];
  children: React.ReactNode;
}) {
  const setTracks = usePlayerStore((s) => s.setTracks);
  useEffect(() => {
    setTracks(tracks);
  }, [tracks, setTracks]);

  return (
    <TracksContext.Provider value={tracks}>{children}</TracksContext.Provider>
  );
}
