import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
  type Timestamp,
} from "firebase/firestore";
import { getDb } from "@/lib/firebase";
import { trackFromDoc } from "@/lib/firestore-tracks";
import type { Track } from "@/types/music";

/* ───────────────────────────────────────────
   초대 코드 · 권한(grant) 데이터 레이어
   — 초대 코드(QR/인증코드)로 다른 사용자가 내 모든 곡(비공개 포함)을 청취.
   invites/{code}: 소유자가 발급. grants/{readerUid_ownerUid}: 수락자가
   유효 코드를 제시해 생성(보안 규칙이 검증). 트랙 read 규칙이 활성 grant 를 허용.
   ─────────────────────────────────────────── */

const INVITES = "invites";
const GRANTS = "grants";

/** 사람이 읽기 쉬운 코드용 알파벳 (혼동되는 I·L·O·U·0·1 제외, Crockford 변형) */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_LEN = 8;

function randomCode(): string {
  let out = "";
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const buf = new Uint32Array(CODE_LEN);
    crypto.getRandomValues(buf);
    for (let i = 0; i < CODE_LEN; i++) out += ALPHABET[buf[i] % ALPHABET.length];
  } else {
    for (let i = 0; i < CODE_LEN; i++)
      out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

const ALPHABET_SET = new Set(ALPHABET.split(""));

/** 입력 코드 정규화 — 대문자화·구분자 제거 + 알파벳에 없는 글자 제거.
    코드 알파벳이 혼동 문자(0·1·I·L·O·U)를 애초에 제외하므로 별도 치환은 불필요. */
export function normalizeCode(raw: string): string {
  return raw
    .toUpperCase()
    .split("")
    .filter((ch) => ALPHABET_SET.has(ch))
    .join("")
    .slice(0, CODE_LEN);
}

/** 표시용 포맷 — XXXX-XXXX */
export function formatCode(code: string): string {
  return code.length > 4 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

export interface Invite {
  code: string;
  ownerUid: string;
  ownerName: string;
  label: string;
  active: boolean;
  createdAt: number;
}

export interface Grant {
  ownerUid: string;
  ownerName: string;
  code: string;
  at: number;
}

function toMillis(v: unknown): number {
  if (typeof v === "number") return v;
  if (v && typeof (v as Timestamp).toMillis === "function") {
    return (v as Timestamp).toMillis();
  }
  return Date.now();
}

function inviteFrom(code: string, d: DocumentData): Invite {
  return {
    code,
    ownerUid: d.ownerUid ?? "",
    ownerName: d.ownerName ?? "",
    label: d.label ?? "",
    active: d.active !== false,
    createdAt: toMillis(d.createdAt),
  };
}

/** 초대 코드 발급 — 충돌 시 재시도 */
export async function createInvite(
  ownerUid: string,
  ownerName: string,
  label = ""
): Promise<Invite> {
  const db = getDb();
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    const ref = doc(db, INVITES, code);
    const existing = await getDoc(ref);
    if (existing.exists()) continue;
    await setDoc(ref, {
      ownerUid,
      ownerName,
      label: label.trim(),
      active: true,
      createdAt: serverTimestamp(),
    });
    return {
      code,
      ownerUid,
      ownerName,
      label: label.trim(),
      active: true,
      createdAt: Date.now(),
    };
  }
  throw new Error("초대 코드 생성에 실패했습니다 — 다시 시도해 주세요");
}

/** 내가 발급한 초대 목록 (최신순) */
export function subscribeMyInvites(
  ownerUid: string,
  onInvites: (invites: Invite[]) => void,
  onError?: (e: Error) => void
): () => void {
  const q = query(collection(getDb(), INVITES), where("ownerUid", "==", ownerUid));
  return onSnapshot(
    q,
    (snap) =>
      onInvites(
        snap.docs
          .map((d) => inviteFrom(d.id, d.data()))
          .sort((a, b) => b.createdAt - a.createdAt)
      ),
    (e) => onError?.(e)
  );
}

export async function setInviteActive(code: string, active: boolean): Promise<void> {
  await updateDoc(doc(getDb(), INVITES, code), { active });
}

export async function deleteInvite(code: string): Promise<void> {
  await deleteDoc(doc(getDb(), INVITES, code));
}

/** 코드로 초대 조회 (수락 페이지 — 비로그인도 read 허용) */
export async function fetchInvite(code: string): Promise<Invite | null> {
  try {
    const snap = await getDoc(doc(getDb(), INVITES, normalizeCode(code)));
    if (!snap.exists()) return null;
    return inviteFrom(snap.id, snap.data());
  } catch {
    return null;
  }
}

export type RedeemResult =
  | { ok: true; ownerUid: string; ownerName: string }
  | { ok: false; reason: "invalid" | "inactive" | "self" | "error" };

/** 초대 수락 — 유효·활성 코드면 grant 생성 (규칙이 재검증) */
export async function redeemInvite(
  rawCode: string,
  readerUid: string
): Promise<RedeemResult> {
  const code = normalizeCode(rawCode);
  if (!code) return { ok: false, reason: "invalid" };
  const invite = await fetchInvite(code);
  if (!invite) return { ok: false, reason: "invalid" };
  if (!invite.active) return { ok: false, reason: "inactive" };
  if (invite.ownerUid === readerUid) return { ok: false, reason: "self" };
  try {
    await setDoc(doc(getDb(), GRANTS, `${readerUid}_${invite.ownerUid}`), {
      readerUid,
      ownerUid: invite.ownerUid,
      ownerName: invite.ownerName,
      code,
      at: serverTimestamp(),
    });
    return { ok: true, ownerUid: invite.ownerUid, ownerName: invite.ownerName };
  } catch {
    return { ok: false, reason: "error" };
  }
}

function grantFrom(d: DocumentData): Grant {
  return {
    ownerUid: d.ownerUid ?? "",
    ownerName: d.ownerName ?? "",
    code: d.code ?? "",
    at: toMillis(d.at),
  };
}

/** 내가 수락한 권한 목록 (어떤 소유자의 라이브러리를 들을 수 있는지) */
export function subscribeMyGrants(
  readerUid: string,
  onGrants: (grants: Grant[]) => void,
  onError?: (e: Error) => void
): () => void {
  const q = query(collection(getDb(), GRANTS), where("readerUid", "==", readerUid));
  return onSnapshot(
    q,
    (snap) =>
      onGrants(
        snap.docs.map((d) => grantFrom(d.data())).sort((a, b) => b.at - a.at)
      ),
    (e) => onError?.(e)
  );
}

/** 수락한 권한 해제 (내 grant 삭제) */
export async function removeGrant(
  readerUid: string,
  ownerUid: string
): Promise<void> {
  await deleteDoc(doc(getDb(), GRANTS, `${readerUid}_${ownerUid}`));
}

/** 특정 소유자의 모든 곡 구독 (활성 grant 가 있을 때만 규칙이 허용) */
export function subscribeOwnerTracks(
  ownerUid: string,
  onTracks: (tracks: Track[]) => void,
  onError?: (e: Error) => void
): () => void {
  const q = query(collection(getDb(), "tracks"), where("ownerUid", "==", ownerUid));
  return onSnapshot(
    q,
    (snap) =>
      onTracks(
        snap.docs
          .map(trackFromDoc)
          .sort(
            (a, b) =>
              a.album.localeCompare(b.album, "ko") ||
              a.title.localeCompare(b.title, "ko")
          )
      ),
    (e) => onError?.(e)
  );
}
