import type { MetadataRoute } from "next";
import { BRAND_NAME, BRAND_NAME_KO, BRAND_TAGLINE } from "@/lib/constants";

/* Web App Manifest — Next 가 <link rel="manifest"> 자동 주입 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${BRAND_NAME} · ${BRAND_NAME_KO}`,
    short_name: BRAND_NAME_KO,
    description: BRAND_TAGLINE,
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    lang: "ko",
    dir: "ltr",
    background_color: "#ffffff",
    theme_color: "#7c3aed",
    categories: ["music", "entertainment"],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
