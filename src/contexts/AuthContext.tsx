"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  GoogleAuthProvider,
  type User,
} from "firebase/auth";
import { getFirebaseAuth, isFirebaseConfigured } from "@/lib/firebase";

/* ───────────────────────────────────────────
   AuthContext — Google 로그인 (모든 인증 사용자 허용)
   Health v1.0 패턴 계승 (네이티브 래퍼 분기는 제외 — 웹 전용)
   ─────────────────────────────────────────── */

interface AuthContextValue {
  user: User | null;
  uid: string | null;
  loading: boolean;
  error: string | null;
  /** Firebase 환경변수 설정 여부 */
  firebaseReady: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const firebaseReady = isFirebaseConfigured();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(firebaseReady);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!firebaseReady) {
      setLoading(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(getFirebaseAuth(), (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });
    return unsubscribe;
  }, [firebaseReady]);

  const signInWithGoogle = async () => {
    setError(null);
    if (!firebaseReady) {
      setError("Firebase가 설정되지 않았습니다. .env.local 을 확인하세요.");
      return;
    }
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      await signInWithPopup(getFirebaseAuth(), provider);
    } catch (err) {
      setError(err instanceof Error ? err.message : "로그인에 실패했습니다.");
    }
  };

  const signOut = async () => {
    if (!firebaseReady) return;
    await firebaseSignOut(getFirebaseAuth());
    setError(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        uid: user?.uid ?? null,
        loading,
        error,
        firebaseReady,
        signInWithGoogle,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
