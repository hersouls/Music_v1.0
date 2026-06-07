import type { Track } from "@/types/music";

/* ───────────────────────────────────────────
   공개곡 다운로드 — 허용 계정 전용 (UI 게이팅)
   ⚠️ 공개곡 음원은 재생 위해 Storage 공개 읽기라, 직접 URL 접근은
      막을 수 없음. 여기서는 다운로드 UI 를 허용 계정에만 노출한다.
   ─────────────────────────────────────────── */

/** 다운로드 허용 계정 (소문자) */
export const DOWNLOAD_ALLOWED_EMAILS = [
  "deasoung@gmail.com",
  "ycdy80@gmail.com",
];

export function canDownload(email?: string | null): boolean {
  return !!email && DOWNLOAD_ALLOWED_EMAILS.includes(email.trim().toLowerCase());
}

/** 파일명 정제 — 경로 구분자·금지문자 제거 */
function safeName(name: string): string {
  return (
    name
      .replace(/[\\/:*?"<>|]+/g, "_")
      .replace(/\s+/g, " ")
      .trim() || "track"
  );
}

function extFromUrl(url: string): string {
  const m = /\.(wav|mp3|m4a|aac|ogg|flac)(?:\?|$)/i.exec(url);
  return m ? `.${m[1].toLowerCase()}` : "";
}

function triggerSave(href: string, filename: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * 원본 음원 다운로드. 크로스오리진 blob 으로 받아 지정 파일명으로 저장
 * (download 속성은 크로스오리진 직접 href 엔 무시되므로 blob 경유).
 * blob 실패 시 새 탭 열기로 폴백.
 */
export async function downloadTrackFile(track: Track): Promise<void> {
  const url = track.originalUrl || track.src;
  if (!url) throw new Error("다운로드할 파일이 없습니다");
  const filename =
    safeName(track.fileName || track.title) +
    (track.fileName ? "" : extFromUrl(url));

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`다운로드 실패 (${res.status})`);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    triggerSave(objectUrl, filename);
    // 즉시 revoke 하면 일부 브라우저가 저장을 취소 — 지연 해제
    setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
  } catch (e) {
    // CORS/네트워크 등 — 새 탭으로 열어 브라우저가 처리하게
    triggerSave(url, filename);
    if (e instanceof Error && /Failed to fetch|NetworkError/i.test(e.message)) {
      return; // 폴백 동작했으니 조용히 종료
    }
  }
}
