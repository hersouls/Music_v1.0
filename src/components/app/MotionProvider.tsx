"use client";

import { MotionConfig } from "framer-motion";

/**
 * framer-motion 전역 reduced-motion 대응.
 * globals.css 의 @media (prefers-reduced-motion) 는 CSS 애니메이션만 줄이고
 * framer-motion 의 JS inline transform/opacity 는 우회하므로, 루트에서 MotionConfig
 * 로 감싸 OS "동작 줄이기" 설정 시 모든 모션을 자동 비활성화한다.
 */
export default function MotionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
