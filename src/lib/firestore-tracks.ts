import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Timestamp,
} from "firebase/firestore";
import { deleteObject, ref } from "firebase/storage";
import { getDb, getFirebaseStorage } from "@/lib/firebase";
import { looksLikeLrc } from "@/lib/lrc";
import type { Track, Visibility } from "@/types/music";

/* ───────────────────────────────────────────
   Firestore 트랙 데이터 레이어 (클라이언트 전용)
   — 컬렉션: tracks/{trackId} (보안 규칙: 공개 읽기/소유자 쓰기)
   — 앨범 = tracks.album 문자열 그룹 (폴더 개념 없음 →
     이동·이름변경에도 문서 id 불변 = 청취 데이터 그대로)
   ─────────────────────────────────────────── */

export const TRACKS_COLLECTION = "tracks";

function toMillis(v: unknown): number {
  if (typeof v === "number") return v;
  if (v && typeof (v as Timestamp).toMillis === "function") {
    return (v as Timestamp).toMillis();
  }
  return Date.now();
}

/** Firestore 문서 → Track (src = 변환 mp3 우선) */
export function trackFromDoc(snap: QueryDocumentSnapshot<DocumentData>): Track {
  const d = snap.data();
  const originalUrl = typeof d.originalUrl === "string" ? d.originalUrl : "";
  const streamUrl = typeof d.streamUrl === "string" ? d.streamUrl : null;
  return {
    id: snap.id,
    ownerUid: d.ownerUid ?? "",
    ownerName: d.ownerName ?? "",
    title: d.title ?? "",
    artist: d.artist ?? d.ownerName ?? "",
    fileName: d.fileName ?? "",
    album: d.album ?? "",
    visibility: d.visibility === "private" ? "private" : "public",
    src: streamUrl || originalUrl,
    originalUrl,
    streamUrl,
    storagePath: d.storagePath ?? "",
    streamPath: typeof d.streamPath === "string" ? d.streamPath : null,
    duration: typeof d.duration === "number" ? d.duration : 0,
    sizeBytes: typeof d.sizeBytes === "number" ? d.sizeBytes : 0,
    sampleRate: typeof d.sampleRate === "number" ? d.sampleRate : 0,
    channels: typeof d.channels === "number" ? d.channels : 0,
    bitsPerSample: typeof d.bitsPerSample === "number" ? d.bitsPerSample : 0,
    lyrics: typeof d.lyrics === "string" && d.lyrics ? d.lyrics : null,
    lyricsFormat:
      d.lyricsFormat === "lrc" || d.lyricsFormat === "txt" ? d.lyricsFormat : null,
    createdAt: toMillis(d.createdAt),
    updatedAt: toMillis(d.updatedAt),
  };
}

/** 보관함과 동일한 정렬 — 앨범명 → 곡 제목 (ko) */
function sortLibrary(tracks: Track[]): Track[] {
  return tracks.sort(
    (a, b) =>
      a.album.localeCompare(b.album, "ko") || a.title.localeCompare(b.title, "ko")
  );
}

/** 내 곡 실시간 구독 — 업로드·이동·가사 수정이 즉시 반영 */
export function subscribeMyTracks(
  uid: string,
  onTracks: (tracks: Track[]) => void,
  onError?: (e: Error) => void
): () => void {
  const q = query(
    collection(getDb(), TRACKS_COLLECTION),
    where("ownerUid", "==", uid)
  );
  return onSnapshot(
    q,
    (snap) => onTracks(sortLibrary(snap.docs.map(trackFromDoc))),
    (e) => onError?.(e)
  );
}

/** 공개 곡 실시간 구독 (둘러보기) — 최신 업로드 우선 */
export function subscribePublicTracks(
  onTracks: (tracks: Track[]) => void,
  onError?: (e: Error) => void
): () => void {
  const q = query(
    collection(getDb(), TRACKS_COLLECTION),
    where("visibility", "==", "public")
  );
  return onSnapshot(
    q,
    (snap) =>
      onTracks(
        snap.docs.map(trackFromDoc).sort((a, b) => b.createdAt - a.createdAt)
      ),
    (e) => onError?.(e)
  );
}

function trackRef(id: string) {
  return doc(getDb(), TRACKS_COLLECTION, id);
}

/** 곡을 앨범↔싱글로 이동 — album 필드만 갱신 (id 불변) */
export async function moveTrack(id: string, album: string): Promise<void> {
  await updateDoc(trackRef(id), {
    album: album.trim(),
    updatedAt: serverTimestamp(),
  });
}

/** 새 앨범 만들기·곡 일괄 담기 — 선택한 곡들의 album 필드를 batch 갱신 (id 불변 = 청취 데이터 유지) */
export async function setTracksAlbum(
  ids: string[],
  album: string
): Promise<number> {
  if (!ids.length) return 0;
  const batch = writeBatch(getDb());
  for (const id of ids) {
    batch.update(trackRef(id), {
      album: album.trim(),
      updatedAt: serverTimestamp(),
    });
  }
  await batch.commit();
  return ids.length;
}

/** 앨범 이름 변경 — 해당 앨범의 내 곡을 일괄 갱신 */
export async function renameAlbum(
  myTracks: Track[],
  from: string,
  to: string
): Promise<number> {
  const targets = myTracks.filter((t) => t.album === from);
  if (!targets.length) return 0;
  const batch = writeBatch(getDb());
  for (const t of targets) {
    batch.update(trackRef(t.id), {
      album: to.trim(),
      updatedAt: serverTimestamp(),
    });
  }
  await batch.commit();
  return targets.length;
}

/** 앨범 삭제 — 안의 곡은 삭제하지 않고 싱글("")로 이동 (v1 시맨틱 유지) */
export async function deleteAlbum(
  myTracks: Track[],
  name: string
): Promise<number> {
  return renameAlbum(myTracks, name, "");
}

/** 곡 삭제 — Firestore 문서 + Storage 원본·스트림 객체 */
export async function deleteTrack(track: Track): Promise<void> {
  await deleteDoc(trackRef(track.id));
  const storage = getFirebaseStorage();
  // 문서가 사라지면 UI 에서는 이미 제거됨 — 객체 삭제 실패(이미 없음 등)는 무시
  const paths = [track.storagePath, track.streamPath].filter(
    (p): p is string => !!p
  );
  await Promise.allSettled(paths.map((p) => deleteObject(ref(storage, p))));
}

/** 가사 저장 — LRC 자동 감지 (타임태그 2줄 이상) */
export async function saveLyrics(
  id: string,
  content: string
): Promise<"lrc" | "txt"> {
  const trimmed = content.trim();
  const format: "lrc" | "txt" = looksLikeLrc(trimmed) ? "lrc" : "txt";
  await updateDoc(trackRef(id), {
    lyrics: trimmed,
    lyricsFormat: format,
    updatedAt: serverTimestamp(),
  });
  return format;
}

export async function deleteLyrics(id: string): Promise<void> {
  await updateDoc(trackRef(id), {
    lyrics: null,
    lyricsFormat: null,
    updatedAt: serverTimestamp(),
  });
}

/** 공개/비공개 토글 */
export async function setTrackVisibility(
  id: string,
  visibility: Visibility
): Promise<void> {
  await updateDoc(trackRef(id), { visibility, updatedAt: serverTimestamp() });
}
