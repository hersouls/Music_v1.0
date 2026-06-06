"use client";

import { useEffect, useMemo } from "react";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { useToastStore } from "@/stores/useToastStore";
import { playerEngine } from "@/lib/player-engine";
import { artworkDataUrl } from "@/lib/artwork";
import { ARTIST_NAME, ALBUM_NAME } from "@/lib/constants";

/* ───────────────────────────────────────────
   AudioEngine — 보이지 않는 전역 배선 컴포넌트
   ① persist 수동 rehydrate (SSR 불일치 방지)
   ② 엔진 이벤트 → 스토어
   ③ Media Session (OS 미디어 키·잠금화면 컨트롤)
   ④ 전역 키보드 단축키
   ─────────────────────────────────────────── */

export default function AudioEngine() {
  /* ① 영속 상태 복원 + 엔진 볼륨 동기화 */
  useEffect(() => {
    void Promise.resolve(usePlayerStore.persist.rehydrate()).then(() => {
      const s = usePlayerStore.getState();
      playerEngine.setVolume(s.volume);
      playerEngine.setMuted(s.muted);
      s._setHydrated();
    });
  }, []);

  /* ② 엔진 이벤트 배선 */
  useEffect(() => {
    playerEngine.listeners = {
      onTime: (t) => usePlayerStore.getState()._onTime(t),
      onDuration: (d) => usePlayerStore.getState()._onDuration(d),
      onEnded: () => usePlayerStore.getState()._onEnded(),
      onPlayState: (p) => usePlayerStore.getState()._onPlayState(p),
      onError: () =>
        useToastStore.getState().addToast({
          type: "error",
          message: "오디오를 재생할 수 없습니다",
        }),
    };
    return () => {
      playerEngine.listeners = {};
    };
  }, []);

  /* ③ Media Session — 메타데이터 */
  const currentId = usePlayerStore((s) => s.currentId);
  const tracks = usePlayerStore((s) => s.tracks);
  const track = useMemo(
    () => tracks.find((t) => t.id === currentId) ?? null,
    [tracks, currentId]
  );

  useEffect(() => {
    if (!track || typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const art = artworkDataUrl(track.id, 512);
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: ARTIST_NAME,
      album: track.album || ALBUM_NAME,
      artwork: art ? [{ src: art, sizes: "512x512", type: "image/png" }] : [],
    });
  }, [track]);

  /* ③ Media Session — 액션 핸들러 (1회) */
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    const st = () => usePlayerStore.getState();
    ms.setActionHandler("play", () => {
      if (!st().isPlaying) st().toggle();
    });
    ms.setActionHandler("pause", () => {
      if (st().isPlaying) st().toggle();
    });
    ms.setActionHandler("previoustrack", () => st().prev());
    ms.setActionHandler("nexttrack", () => st().next());
    try {
      ms.setActionHandler("seekto", (e) => {
        if (e.seekTime != null) st().seek(e.seekTime);
      });
    } catch {
      // 일부 브라우저는 seekto 미지원
    }
    return () => {
      (["play", "pause", "previoustrack", "nexttrack", "seekto"] as const).forEach(
        (action) => {
          try {
            ms.setActionHandler(action, null);
          } catch {
            // 미지원 액션 무시
          }
        }
      );
    };
  }, []);

  /* ④ 전역 키보드 단축키 */
  useEffect(() => {
    function isTyping(e: KeyboardEvent): boolean {
      const el = e.target as HTMLElement | null;
      return (
        !!el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" ||
          el.isContentEditable)
      );
    }
    function onKey(e: KeyboardEvent) {
      if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      const st = usePlayerStore.getState();
      switch (e.key) {
        case " ": {
          // 버튼/링크에 포커스가 있으면 네이티브 활성화에 맡김 (이중 토글 방지)
          const el = e.target as HTMLElement | null;
          if (el?.closest?.('button, a, [role="button"]')) return;
          e.preventDefault();
          st.toggle();
          break;
        }
        case "ArrowRight":
          e.preventDefault();
          if (e.shiftKey) st.next();
          else if (st.currentId) st.seek(Math.min(st.duration, st.currentTime + 5));
          break;
        case "ArrowLeft":
          e.preventDefault();
          if (e.shiftKey) st.prev();
          else if (st.currentId) st.seek(Math.max(0, st.currentTime - 5));
          break;
        case "ArrowUp":
          e.preventDefault();
          st.setVolume(st.volume + 0.05);
          break;
        case "ArrowDown":
          e.preventDefault();
          st.setVolume(st.volume - 0.05);
          break;
        case "m":
        case "M":
          st.toggleMute();
          break;
        case "f":
        case "F":
          if (st.currentId) st.toggleFavorite(st.currentId);
          break;
        case "Escape":
          if (st.nowPlayingOpen) st.setNowPlayingOpen(false);
          break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return null;
}
