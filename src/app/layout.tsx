import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import AppShell from "@/components/app/AppShell";
import MotionProvider from "@/components/app/MotionProvider";
import { BRAND_NAME, BRAND_NAME_KO, BRAND_TAGLINE, SITE_URL } from "@/lib/constants";
import "./globals.css";

const pretendard = localFont({
  src: [
    {
      path: "../../public/fonts/PretendardVariable.woff2",
      style: "normal",
    },
  ],
  variable: "--font-pretendard",
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
});

export const metadata: Metadata = {
  title: {
    default: `${BRAND_NAME} · ${BRAND_NAME_KO}`,
    template: `%s | ${BRAND_NAME}`,
  },
  description: `${BRAND_TAGLINE} — 내 음악을 클라우드에 올리고 어디서든 스트리밍.`,
  keywords: ["음악", "뮤직 플레이어", "WAV", "무손실", "Moonwave"],
  authors: [{ name: "Moonwave" }],
  creator: "Moonwave",
  metadataBase: new URL(SITE_URL),
  openGraph: {
    type: "website",
    locale: "ko_KR",
    url: SITE_URL,
    siteName: BRAND_NAME,
    title: `${BRAND_NAME} · ${BRAND_NAME_KO}`,
    description: BRAND_TAGLINE,
  },
  robots: { index: false, follow: false },
  applicationName: BRAND_NAME_KO,
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: BRAND_NAME_KO,
  },
  icons: {
    icon: "/icon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#7c3aed",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" className={pretendard.variable}>
      <body className="font-sans antialiased bg-surface-secondary text-heading">
        <MotionProvider>
          <AppShell>{children}</AppShell>
        </MotionProvider>
      </body>
    </html>
  );
}
