import {
  Home,
  Library,
  Heart,
  BarChart3,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  desc: string;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "홈", icon: Home, desc: "지금 재생 · 청취 요약" },
  { href: "/library", label: "보관함", icon: Library, desc: "전체 트랙 목록" },
  { href: "/favorites", label: "즐겨찾기", icon: Heart, desc: "좋아요 표시한 곡" },
  { href: "/stats", label: "청취 통계", icon: BarChart3, desc: "재생 기록 · 분석" },
];
