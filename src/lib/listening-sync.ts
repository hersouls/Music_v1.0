import {
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { getDb } from "@/lib/firebase";
import { usePlayerStore } from "@/stores/usePlayerStore";
import type { PlayEvent } from "@/types/music";

/* ───────────────────────────────────────────
   청취 데이터 동기화 — users/{uid}/data/listening 단일 문서
   (favorites · playCounts · recentPlays)
   원격 → 스토어: onSnapshot (다른 기기 변경 실시간 반영)
   스토어 → 원격: subscribe + 디바운스 setDoc(merge)
   에코 억제: 마지막 송신 페이로드와 같으면 무시
   ─────────────────────────────────────────── */

const WRITE_DEBOUNCE_MS = 1500;

interface ListeningData {
  favorites: string[];
  playCounts: Record<string, number>;
  recentPlays: PlayEvent[];
}

function snapshot(): ListeningData {
  const s = usePlayerStore.getState();
  return {
    favorites: s.favorites,
    playCounts: s.playCounts,
    recentPlays: s.recentPlays,
  };
}

function serialize(d: ListeningData): string {
  return JSON.stringify([d.favorites, d.playCounts, d.recentPlays]);
}

let stop: (() => void) | null = null;

/** 로그인 시 1회 시작 — 반환 함수로 정지(로그아웃) */
export function startListeningSync(uid: string): () => void {
  stopListeningSync();

  const ref = doc(getDb(), "users", uid, "data", "listening");
  let applyingRemote = false;
  let lastSent = "";
  let timer: ReturnType<typeof setTimeout> | null = null;
  let remoteSeen = false;

  function scheduleWrite() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      const data = snapshot();
      const payload = serialize(data);
      if (payload === lastSent) return;
      lastSent = payload;
      setDoc(
        ref,
        { ...data, updatedAt: serverTimestamp() },
        { merge: true }
      ).catch(() => {
        lastSent = ""; // 실패 시 다음 변경에서 재시도
      });
    }, WRITE_DEBOUNCE_MS);
  }

  const unsubSnap = onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        // 첫 로그인 — 현재 로컬 상태를 초기 문서로 업로드
        if (!remoteSeen) {
          remoteSeen = true;
          scheduleWrite();
        }
        return;
      }
      remoteSeen = true;
      const d = snap.data();
      const incoming: ListeningData = {
        favorites: Array.isArray(d.favorites) ? (d.favorites as string[]) : [],
        playCounts:
          d.playCounts && typeof d.playCounts === "object"
            ? (d.playCounts as Record<string, number>)
            : {},
        recentPlays: Array.isArray(d.recentPlays)
          ? (d.recentPlays as PlayEvent[])
          : [],
      };
      const payload = serialize(incoming);
      if (payload === lastSent) return; // 내 쓰기의 에코
      if (payload === serialize(snapshot())) return; // 이미 동일
      lastSent = payload;
      applyingRemote = true;
      usePlayerStore.setState(incoming);
      applyingRemote = false;
    },
    () => {
      /* 구독 오류 — 로컬 영속만으로 동작 (재로그인 시 재시도) */
    }
  );

  const unsubStore = usePlayerStore.subscribe((s, prev) => {
    if (applyingRemote) return;
    if (
      s.favorites === prev.favorites &&
      s.playCounts === prev.playCounts &&
      s.recentPlays === prev.recentPlays
    ) {
      return;
    }
    scheduleWrite();
  });

  stop = () => {
    unsubSnap();
    unsubStore();
    if (timer) clearTimeout(timer);
    timer = null;
    stop = null;
  };
  return stop;
}

export function stopListeningSync() {
  stop?.();
}
