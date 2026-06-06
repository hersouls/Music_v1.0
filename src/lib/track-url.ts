import { SITE_URL } from "@/lib/constants";

/* 곡 공유 URL — 런타임 origin 우선(배포 도메인 자동), 없으면 SITE_URL */
export function trackShareUrl(id: string): string {
  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : SITE_URL;
  return `${origin}/track/${id}`;
}

/** 클립보드 복사 (실패 시 false) */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* 폴백 시도 */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
