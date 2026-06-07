"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { fetchInvite, redeemInvite, type Invite } from "@/lib/invites";
import { isFirebaseConfigured } from "@/lib/firebase";
import { BRAND_NAME, BRAND_NAME_KO } from "@/lib/constants";
import {
  AudioWaveform,
  Ticket,
  Loader2,
  LogIn,
  Check,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";

/* ───────────────────────────────────────────
   /invite/[code] — 초대 수락 (로그인 없이 진입, 수락엔 로그인 필요)
   인증 게이트 밖 단독 렌더. 초대자 표시 → Google 로그인 → 수락 →
   grant 생성 → 공유 보관함(/shared)으로.
   ─────────────────────────────────────────── */

type Status = "loading" | "ready" | "invalid" | "inactive" | "unconfigured";

export default function InviteAcceptPage() {
  const params = useParams<{ code: string }>();
  const code = params?.code ?? "";
  const router = useRouter();
  const { user, uid, loading: authLoading, signInWithGoogle } = useAuth();

  const [status, setStatus] = useState<Status>("loading");
  const [invite, setInvite] = useState<Invite | null>(null);
  const [redeeming, setRedeeming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** "로그인하고 수락" 클릭 시 — 로그인 완료되면 자동 수락 */
  const pendingAccept = useRef(false);

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setStatus("unconfigured");
      return;
    }
    let alive = true;
    fetchInvite(code).then((inv) => {
      if (!alive) return;
      if (!inv) setStatus("invalid");
      else {
        setInvite(inv);
        setStatus(inv.active ? "ready" : "inactive");
      }
    });
    return () => {
      alive = false;
    };
  }, [code]);

  useEffect(() => {
    if (invite) document.title = `${invite.ownerName}님의 음악 초대 · ${BRAND_NAME}`;
  }, [invite]);

  const isSelf = !!uid && !!invite && uid === invite.ownerUid;

  /* 로그인 후 자동 수락 — "로그인하고 수락"을 한 번에 완결 */
  useEffect(() => {
    if (pendingAccept.current && uid && invite && status === "ready" && !isSelf) {
      pendingAccept.current = false;
      void accept();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, invite, status, isSelf]);

  async function accept() {
    if (!uid || !invite || redeeming) return;
    setRedeeming(true);
    setError(null);
    const r = await redeemInvite(code, uid);
    if (r.ok) {
      router.push("/shared");
      return;
    }
    setError(
      r.reason === "self"
        ? "내가 만든 초대는 받을 수 없어요"
        : r.reason === "inactive"
          ? "중지된 초대예요"
          : r.reason === "invalid"
            ? "유효하지 않은 초대예요"
            : "수락에 실패했어요 — 다시 시도해 주세요"
    );
    setRedeeming(false);
  }

  return (
    <div className="np-hero flex min-h-dvh items-center justify-center p-4">
      <div className="dash-hero__shapes" aria-hidden="true">
        <span className="dash-hero__shape dash-hero__shape--a" />
        <span className="dash-hero__shape dash-hero__shape--b" />
        <span className="dash-hero__shape dash-hero__shape--c" />
      </div>

      <div className="relative z-[1] w-full max-w-sm text-center">
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-2 text-white/85 transition-colors hover:text-white"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25 backdrop-blur-sm">
            <AudioWaveform className="h-4 w-4" />
          </span>
          <span className="text-sm font-bold">{BRAND_NAME}</span>
        </Link>

        {status === "loading" || authLoading ? (
          <Loader2 className="mx-auto h-7 w-7 animate-spin text-white/70" />
        ) : status === "unconfigured" || status === "invalid" || status === "inactive" ? (
          <Card
            icon={<AlertTriangle className="h-7 w-7 text-white/80" />}
            title={
              status === "inactive" ? "중지된 초대예요" : "유효하지 않은 초대예요"
            }
            desc={
              status === "inactive"
                ? "초대한 사람이 이 코드를 중지했어요. 새 코드를 받아 주세요."
                : "초대 링크가 정확한지 확인해 주세요. 만료되었거나 삭제된 코드일 수 있어요."
            }
          />
        ) : (
          <div className="rounded-3xl bg-white/10 p-7 ring-1 ring-white/20 backdrop-blur-sm">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25">
              <Ticket className="h-8 w-8 text-white" />
            </div>
            <p className="text-sm text-white/75">{invite?.ownerName}님이</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-white">
              음악을 공유했어요 🎧
            </h1>
            <p className="mt-2 text-sm text-white/80">
              초대를 수락하면 {invite?.ownerName}님의 <strong>모든 곡</strong>을
              {BRAND_NAME_KO}에서 들을 수 있어요.
            </p>

            {isSelf ? (
              <Link
                href="/settings"
                className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3.5 text-sm font-bold text-bora-700 shadow-xl shadow-black/15 transition-transform hover:scale-[1.02] active:scale-95"
              >
                내가 만든 초대예요 — 설정으로
                <ArrowRight className="h-4 w-4" />
              </Link>
            ) : !user ? (
              <button
                onClick={() => {
                  pendingAccept.current = true;
                  void signInWithGoogle();
                }}
                className="mt-7 inline-flex w-full items-center justify-center gap-2.5 rounded-2xl bg-white px-5 py-3.5 text-sm font-bold text-bora-700 shadow-xl shadow-black/15 transition-transform hover:scale-[1.02] active:scale-95"
              >
                <LogIn className="h-4.5 w-4.5" />
                Google로 로그인하고 수락
              </button>
            ) : (
              <button
                onClick={() => void accept()}
                disabled={redeeming}
                className="mt-7 inline-flex w-full items-center justify-center gap-2.5 rounded-2xl bg-white px-5 py-3.5 text-sm font-bold text-bora-700 shadow-xl shadow-black/15 transition-transform hover:scale-[1.02] active:scale-95 disabled:opacity-60"
              >
                {redeeming ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : <Check className="h-4.5 w-4.5" />}
                {redeeming ? "수락하는 중…" : "수락하고 듣기"}
              </button>
            )}

            {error && (
              <p className="mt-4 rounded-xl bg-white/10 px-4 py-2.5 text-xs text-white ring-1 ring-white/20">
                {error}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Card({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div className="rounded-3xl bg-white/10 p-7 ring-1 ring-white/20 backdrop-blur-sm">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
        {icon}
      </div>
      <p className="text-base font-bold text-white">{title}</p>
      <p className="mt-1.5 text-sm text-white/70">{desc}</p>
      <Link
        href="/"
        className="mt-6 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-xs font-medium text-white/80 ring-1 ring-white/20 transition-colors hover:bg-white/20 hover:text-white"
      >
        {BRAND_NAME} 홈으로
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
