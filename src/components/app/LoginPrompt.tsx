"use client";

import { useAuth } from "@/contexts/AuthContext";
import EmptyState from "@/components/ui/EmptyState";
import { LogIn } from "lucide-react";

/* ───────────────────────────────────────────
   LoginPrompt — 로그인 필요한 페이지(보관함·설정)에서
   비로그인 사용자에게 표시. Google 로그인 유도.
   ─────────────────────────────────────────── */

export default function LoginPrompt({
  title = "로그인이 필요해요",
  description = "이 기능은 로그인 후 사용할 수 있어요. 듣기는 로그인 없이도 가능해요.",
}: {
  title?: string;
  description?: string;
}) {
  const { signInWithGoogle } = useAuth();
  return (
    <EmptyState
      icon={LogIn}
      title={title}
      description={description}
      action={{ label: "Google로 로그인", onClick: () => void signInWithGoogle() }}
    />
  );
}
