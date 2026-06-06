import type { Metadata } from "next";
import { BRAND_NAME, BRAND_NAME_KO, BRAND_TAGLINE } from "@/lib/constants";
import TrackShareClient from "./TrackShareClient";

/* ───────────────────────────────────────────
   /track/[id] — 공개 곡 공유 라우트
   서버에서 곡 메타를 읽어 동적 OG 태그 생성(카톡/메신저 미리보기에
   커버·제목 노출). 공개곡만 Firestore REST(웹 키, 비인증)로 조회 —
   보안 규칙이 공개 read 만 허용하므로 비공개는 노출되지 않는다.
   실제 재생 UI 는 클라이언트(TrackShareClient).
   ─────────────────────────────────────────── */

interface OgTrack {
  title: string;
  artist: string;
  album: string;
  coverUrl: string | null;
  visibility: string;
}

async function fetchPublicTrackMeta(id: string): Promise<OgTrack | null> {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!projectId || !apiKey) return null;
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/tracks/${encodeURIComponent(
      id
    )}?key=${apiKey}`;
    const res = await fetch(url, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      fields?: Record<string, { stringValue?: string }>;
    };
    const f = json.fields;
    if (!f) return null;
    const s = (k: string) => f[k]?.stringValue ?? "";
    return {
      title: s("title"),
      artist: s("ownerName") || s("artist"),
      album: s("album"),
      coverUrl: f.coverUrl?.stringValue ?? null,
      visibility: s("visibility"),
    };
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const t = await fetchPublicTrackMeta(id);

  // 비공개·없는 곡은 곡 정보를 노출하지 않음(일반 메타)
  if (!t || t.visibility !== "public" || !t.title) {
    return {
      title: `공유된 곡 · ${BRAND_NAME}`,
      description: BRAND_TAGLINE,
    };
  }

  const title = `${t.title} · ${BRAND_NAME}`;
  const description = `${t.artist || BRAND_NAME_KO} · ${BRAND_TAGLINE}`;
  const images = t.coverUrl ? [{ url: t.coverUrl, width: 1024, height: 1024 }] : [];

  return {
    title,
    description,
    openGraph: {
      type: "music.song",
      title: t.title,
      description,
      images,
      siteName: BRAND_NAME,
    },
    twitter: {
      card: images.length ? "summary_large_image" : "summary",
      title: t.title,
      description,
      images: images.map((i) => i.url),
    },
  };
}

export default function TrackSharePage() {
  return <TrackShareClient />;
}
