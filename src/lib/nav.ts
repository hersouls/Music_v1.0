import {
  Home,
  Library,
  Compass,
  Heart,
  BarChart3,
  Users,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  desc: string;
  /** 로그인해야 의미 있는 항목 — 비로그인 시 내비에서 숨김 */
  authRequired?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "홈", icon: Home, desc: "지금 재생 · 청취 요약" },
  { href: "/library", label: "보관함", icon: Library, desc: "내 트랙 관리", authRequired: true },
  { href: "/browse", label: "둘러보기", icon: Compass, desc: "모두의 공개 곡" },
  { href: "/favorites", label: "즐겨찾기", icon: Heart, desc: "좋아요 표시한 곡" },
  { href: "/stats", label: "청취 통계", icon: BarChart3, desc: "재생 기록 · 분석" },
  { href: "/settings", label: "설정", icon: Settings, desc: "초대 · 공유 관리", authRequired: true },
];

/** 공유받은 음악이 있을 때만 노출하는 동적 내비 항목 */
export const SHARED_NAV_ITEM: NavItem = {
  href: "/shared",
  label: "공유 보관함",
  icon: Users,
  desc: "초대로 공유받은 음악",
};
