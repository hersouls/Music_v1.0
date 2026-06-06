import { initializeApp, getApps } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import {
  initializeFirestore,
  memoryLocalCache,
  enableNetwork,
  type Firestore,
} from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";

/* ───────────────────────────────────────────
   Firebase 부트스트랩 (Health v1.0 패턴 계승)
   — 환경변수 미설정 시 우아한 폴백(isFirebaseConfigured)
   ─────────────────────────────────────────── */

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/** Firebase 환경변수가 설정되었는지 확인 (.env.local 미설정 시 폴백용) */
export function isFirebaseConfigured(): boolean {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
}

/* ── Firestore config versioning — 스키마 변경 시 stale 캐시 정리 ── */
const FIRESTORE_CONFIG_VERSION = 1;

function clearStaleFirestoreCache() {
  const KEY = "music_firestore_config_v";
  try {
    const stored = localStorage.getItem(KEY);
    const current = String(FIRESTORE_CONFIG_VERSION);
    if (stored === current) return;
    if (stored !== null && typeof indexedDB.databases === "function") {
      indexedDB.databases().then((dbs) => {
        for (const db of dbs) {
          if (
            db.name &&
            (db.name.includes("firestore") ||
              db.name.includes("firebase-heartbeat"))
          ) {
            indexedDB.deleteDatabase(db.name);
          }
        }
      });
    }
    localStorage.setItem(KEY, current);
  } catch {
    /* 일부 브라우저에서 indexedDB.databases() 미지원 */
  }
}

/* ── Lazy singletons ── */
function getApp() {
  return getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
}

let _auth: Auth | undefined;
let _db: Firestore | undefined;
let _storage: FirebaseStorage | undefined;

export function getFirebaseAuth(): Auth {
  if (!_auth) _auth = getAuth(getApp());
  return _auth;
}

export function getDb(): Firestore {
  if (!_db) {
    if (typeof window !== "undefined") {
      clearStaleFirestoreCache();
    }
    _db = initializeFirestore(getApp(), {
      localCache: memoryLocalCache(),
      ignoreUndefinedProperties: true,
    });
  }
  return _db;
}

export function getFirebaseStorage(): FirebaseStorage {
  if (!_storage) _storage = getStorage(getApp());
  return _storage;
}

/* ── 연결 복구 — 탭 복귀/온라인 시 네트워크 재활성 ── */
let _recoverySetup = false;

export function setupConnectionRecovery() {
  if (_recoverySetup || typeof window === "undefined") return;
  if (!isFirebaseConfigured()) return;
  _recoverySetup = true;

  const db = getDb();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      enableNetwork(db).catch(() => {});
    }
  });
  window.addEventListener("online", () => {
    enableNetwork(db).catch(() => {});
  });
}
