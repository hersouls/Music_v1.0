"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useToastStore } from "@/stores/useToastStore";
import { useDialogStore } from "@/stores/useDialogStore";
import {
  createInvite,
  subscribeMyInvites,
  subscribeMyGrants,
  setInviteActive,
  deleteInvite,
  redeemInvite,
  removeGrant,
  formatCode,
  normalizeCode,
  type Invite,
  type Grant,
} from "@/lib/invites";
import { copyToClipboard } from "@/lib/track-url";
import { SITE_URL } from "@/lib/constants";
import { relativeTimeKo } from "@/lib/format";
import { cn } from "@/lib/utils";
import PageHeader from "@/components/ui/PageHeader";
import SectionCard from "@/components/ui/SectionCard";
import EmptyState from "@/components/ui/EmptyState";
import LoginPrompt from "@/components/app/LoginPrompt";
import { Field, fieldInputClass } from "@/components/ui/Form";
import InviteQR from "@/components/app/InviteQR";
import {
  Ticket,
  Plus,
  Link2,
  Copy,
  Check,
  Trash2,
  Power,
  PowerOff,
  Users,
  Loader2,
  Play,
  LogIn,
} from "lucide-react";

/* ───────────────────────────────────────────
   설정 — 초대하기(내 모든 곡 공유) · 받은 공유 관리
   초대 코드(QR/인증코드)로 다른 사람이 내 비공개 곡까지 청취 가능.
   ─────────────────────────────────────────── */

function inviteUrl(code: string): string {
  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : SITE_URL;
  return `${origin}/invite/${code}`;
}

export default function SettingsPage() {
  const { uid, user } = useAuth();
  const addToast = useToastStore((s) => s.addToast);
  const openDialog = useDialogStore((s) => s.openDialog);

  const [invites, setInvites] = useState<Invite[]>([]);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!uid) return;
    const a = subscribeMyInvites(uid, setInvites, () => setInvites([]));
    const b = subscribeMyGrants(uid, setGrants, () => setGrants([]));
    return () => {
      a();
      b();
    };
  }, [uid]);

  async function handleCreate() {
    if (!uid || creating) return;
    setCreating(true);
    try {
      const ownerName = user?.displayName || user?.email?.split("@")[0] || "Moonwave";
      await createInvite(uid, ownerName);
      addToast({ type: "success", message: "새 초대 코드를 만들었어요" });
    } catch (e) {
      addToast({
        type: "error",
        message: e instanceof Error ? e.message : "초대 생성에 실패했어요",
      });
    } finally {
      setCreating(false);
    }
  }

  if (!uid) {
    return (
      <div className="space-y-6">
        <PageHeader title="설정" description="초대 · 공유 관리" />
        <LoginPrompt
          title="로그인이 필요해요"
          description="초대 코드 발급·공유 관리는 로그인 후 사용할 수 있어요."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="설정" description="초대 · 공유 관리" />

      {/* ── 초대하기 ── */}
      <SectionCard
        title="초대하기"
        icon={Ticket}
        description="초대 코드(QR·인증코드)로 내 모든 곡(비공개 포함)을 공유해요"
        action={
          <button
            onClick={handleCreate}
            disabled={creating}
            className="flex items-center gap-1.5 rounded-lg bg-bora-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-bora-700 disabled:opacity-50"
          >
            {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            새 초대
          </button>
        }
        bodyClassName="space-y-3"
      >
        {invites.length === 0 ? (
          <p className="py-6 text-center text-sm text-caption">
            아직 만든 초대가 없어요. <strong className="text-body">새 초대</strong>를 눌러 QR·코드를 만들어 보세요.
          </p>
        ) : (
          invites.map((inv) => (
            <InviteCard
              key={inv.code}
              invite={inv}
              addToast={addToast}
              openDialog={openDialog}
            />
          ))
        )}
      </SectionCard>

      {/* ── 받은 공유 ── */}
      <SectionCard
        title="받은 공유"
        icon={Users}
        description="초대 코드를 입력하면 그 사람의 모든 곡을 들을 수 있어요"
        bodyClassName="space-y-4"
      >
        <RedeemForm uid={uid} addToast={addToast} />

        {grants.length > 0 && (
          <ul className="divide-y divide-surface-2 overflow-hidden rounded-2xl border border-strong">
            {grants.map((g) => (
              <GrantRow
                key={g.ownerUid}
                grant={g}
                uid={uid}
                addToast={addToast}
                openDialog={openDialog}
              />
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

/* ── 초대 카드 (QR + 코드 + 관리) ── */
function InviteCard({
  invite,
  addToast,
  openDialog,
}: {
  invite: Invite;
  addToast: ReturnType<typeof useToastStore.getState>["addToast"];
  openDialog: ReturnType<typeof useDialogStore.getState>["openDialog"];
}) {
  const [copied, setCopied] = useState<"link" | "code" | null>(null);
  const [busy, setBusy] = useState(false);
  const url = inviteUrl(invite.code);

  async function copy(kind: "link" | "code") {
    const text = kind === "link" ? url : invite.code;
    if (await copyToClipboard(text)) {
      setCopied(kind);
      setTimeout(() => setCopied(null), 2000);
    }
  }

  async function toggleActive() {
    if (busy) return;
    setBusy(true);
    try {
      await setInviteActive(invite.code, !invite.active);
      addToast({
        type: "success",
        message: invite.active ? "초대를 중지했어요" : "초대를 다시 활성화했어요",
      });
    } catch {
      addToast({ type: "error", message: "변경에 실패했어요" });
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete() {
    openDialog({
      title: "초대 삭제",
      description:
        "이 초대 코드를 삭제하면 이 코드로 받은 모든 사람의 접근이 즉시 끊겨요. 계속할까요?",
      confirmLabel: "삭제",
      variant: "danger",
      onConfirm: async () => {
        try {
          await deleteInvite(invite.code);
          addToast({ type: "success", message: "초대를 삭제했어요" });
        } catch {
          addToast({ type: "error", message: "삭제에 실패했어요" });
          throw new Error("del");
        }
      },
    });
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-2xl border border-strong p-4 sm:flex-row sm:items-center",
        !invite.active && "opacity-60"
      )}
    >
      <InviteQR value={url} size={132} className="shrink-0 self-center sm:self-auto" />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xl font-bold tracking-widest text-heading">
            {formatCode(invite.code)}
          </span>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-semibold",
              invite.active ? "bg-emerald-50 text-emerald-700" : "bg-surface-secondary text-caption"
            )}
          >
            {invite.active ? "활성" : "중지됨"}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-caption">{relativeTimeKo(new Date(invite.createdAt).toISOString())} 생성</p>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={() => copy("link")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-strong bg-surface-primary px-3 py-1.5 text-xs font-medium text-body transition-colors hover:bg-surface-secondary"
          >
            {copied === "link" ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Link2 className="h-3.5 w-3.5" />}
            링크 복사
          </button>
          <button
            onClick={() => copy("code")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-strong bg-surface-primary px-3 py-1.5 text-xs font-medium text-body transition-colors hover:bg-surface-secondary"
          >
            {copied === "code" ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
            코드 복사
          </button>
          <button
            onClick={toggleActive}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-strong bg-surface-primary px-3 py-1.5 text-xs font-medium text-body transition-colors hover:bg-surface-secondary disabled:opacity-50"
          >
            {invite.active ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
            {invite.active ? "중지" : "활성화"}
          </button>
          <button
            onClick={confirmDelete}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
          >
            <Trash2 className="h-3.5 w-3.5" /> 삭제
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── 코드 입력 수락 ── */
function RedeemForm({
  uid,
  addToast,
}: {
  uid: string | null;
  addToast: ReturnType<typeof useToastStore.getState>["addToast"];
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!uid || busy) return;
    const clean = normalizeCode(code);
    if (!clean) {
      addToast({ type: "error", message: "초대 코드를 입력하세요" });
      return;
    }
    setBusy(true);
    try {
      const r = await redeemInvite(clean, uid);
      if (r.ok) {
        addToast({
          type: "success",
          message: `${r.ownerName}님의 음악을 공유받았어요 — 공유 보관함에서 들어보세요`,
          duration: 5000,
        });
        setCode("");
      } else {
        const msg =
          r.reason === "self"
            ? "내가 만든 초대는 받을 수 없어요"
            : r.reason === "inactive"
              ? "중지된 초대 코드예요"
              : r.reason === "invalid"
                ? "유효하지 않은 코드예요"
                : "수락에 실패했어요";
        addToast({ type: "error", message: msg });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <Field label="초대 코드 입력" hint="QR을 스캔하거나 받은 코드를 입력하세요">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            disabled={busy}
            placeholder="예: ABCD-2345"
            aria-label="초대 코드"
            autoCapitalize="characters"
            className={cn(fieldInputClass, "font-mono tracking-widest sm:flex-1")}
          />
          <button
            type="submit"
            disabled={busy || !code.trim()}
            className="flex items-center justify-center gap-2 rounded-xl bg-bora-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-bora-700 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
            수락
          </button>
        </div>
      </Field>
    </form>
  );
}

/* ── 받은 공유 행 ── */
function GrantRow({
  grant,
  uid,
  addToast,
  openDialog,
}: {
  grant: Grant;
  uid: string | null;
  addToast: ReturnType<typeof useToastStore.getState>["addToast"];
  openDialog: ReturnType<typeof useDialogStore.getState>["openDialog"];
}) {
  const router = useRouter();

  function confirmRemove() {
    openDialog({
      title: "공유 해제",
      description: `${grant.ownerName}님의 공유를 내 목록에서 제거할까요? (상대의 곡엔 영향 없어요)`,
      confirmLabel: "해제",
      variant: "danger",
      onConfirm: async () => {
        if (!uid) return;
        try {
          await removeGrant(uid, grant.ownerUid);
          addToast({ type: "success", message: "공유를 해제했어요" });
        } catch {
          addToast({ type: "error", message: "해제에 실패했어요" });
          throw new Error("rm");
        }
      },
    });
  }

  return (
    <li className="flex items-center gap-3 bg-surface-primary px-4 py-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bora-50 text-bora-600">
        <Users className="h-4.5 w-4.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-heading">{grant.ownerName}님의 음악</p>
        <p className="truncate text-xs text-caption">{relativeTimeKo(new Date(grant.at).toISOString())} 수락</p>
      </div>
      <button
        onClick={() => router.push("/shared")}
        className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-bora-600 transition-colors hover:bg-bora-50"
      >
        <Play className="h-3.5 w-3.5" fill="currentColor" /> 듣기
      </button>
      <button
        onClick={confirmRemove}
        aria-label="공유 해제"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-caption transition-colors hover:bg-red-50 hover:text-red-600"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </li>
  );
}
