"use client";

import { useAuth } from "@/contexts/AuthContext";
import { BRAND_NAME, BRAND_NAME_KO, BRAND_TAGLINE } from "@/lib/constants";
import { AudioWaveform, LogIn, AlertTriangle } from "lucide-react";

/* ───────────────────────────────────────────
   LoginScreen — Google 로그인 게이트 (np-hero 그라데이션)
   Firebase 미설정 시 설정 안내 표시.
   ─────────────────────────────────────────── */

export default function LoginScreen() {
  const { signInWithGoogle, error, firebaseReady } = useAuth();

  if (!firebaseReady) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-surface-secondary p-4">
        <div className="w-full max-w-md rounded-2xl border border-strong bg-surface-primary p-8 shadow-sm">
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50">
            <AlertTriangle className="h-6 w-6 text-amber-500" />
          </div>
          <h1 className="text-lg font-bold text-heading">Firebase 설정이 필요합니다</h1>
          <p className="mt-2 text-sm text-body">
            <code className="rounded bg-surface-secondary px-1.5 py-0.5 text-bora-700">
              .env.local
            </code>{" "}
            에 Firebase 웹 설정값을 입력한 뒤 개발 서버를 다시 시작하세요.
          </p>
          <pre className="mt-4 overflow-x-auto rounded-xl bg-gray-900 p-4 text-xs leading-relaxed text-gray-100">
{`NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...`}
          </pre>
          <p className="mt-4 text-xs text-caption">
            <code>.env.example</code> 파일을 참고하세요.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="np-hero flex min-h-dvh items-center justify-center p-4">
      <div className="dash-hero__shapes" aria-hidden="true">
        <span className="dash-hero__shape dash-hero__shape--a" />
        <span className="dash-hero__shape dash-hero__shape--b" />
        <span className="dash-hero__shape dash-hero__shape--c" />
      </div>

      <div className="relative z-[1] w-full max-w-sm text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25 backdrop-blur-sm">
          <AudioWaveform className="h-8 w-8 text-white" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-white">{BRAND_NAME}</h1>
        <p className="mt-2 text-sm text-white/80">
          {BRAND_NAME_KO} · {BRAND_TAGLINE}
        </p>

        <button
          onClick={signInWithGoogle}
          className="mt-8 inline-flex w-full items-center justify-center gap-2.5 rounded-2xl bg-white px-5 py-3.5 text-sm font-bold text-bora-700 shadow-xl shadow-black/15 transition-transform hover:scale-[1.02] active:scale-95"
        >
          <LogIn className="h-4.5 w-4.5" />
          Google 계정으로 시작하기
        </button>

        {error && (
          <p className="mt-4 rounded-xl bg-white/10 px-4 py-2.5 text-xs text-white ring-1 ring-white/20">
            {error}
          </p>
        )}

        <p className="mt-6 text-[11px] text-white/55">
          로그인하면 내 음악을 클라우드에 보관하고 어디서든 들을 수 있어요.
        </p>
      </div>
    </div>
  );
}
