"use client";

import { useEffect, useRef } from "react";
import { playerEngine } from "@/lib/player-engine";

/* ───────────────────────────────────────────
   Visualizer — Web Audio AnalyserNode 주파수 막대
   (캔버스, rAF 루프 — 마운트 중에만 동작)
   analyser 는 첫 재생 후 생성되므로 매 프레임 조회.
   ─────────────────────────────────────────── */

export default function Visualizer({
  className,
  color = "rgba(255,255,255,0.85)",
  bars = 48,
}: {
  className?: string;
  color?: string;
  bars?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let alive = true;
    let buffer: Uint8Array<ArrayBuffer> | null = null;

    function draw() {
      if (!alive || !canvas || !ctx) return;
      raf = requestAnimationFrame(draw);

      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const dpr = window.devicePixelRatio || 1;
      const w = Math.round(rect.width * dpr);
      const h = Math.round(rect.height * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, rect.width, rect.height);

      const analyser = playerEngine.getAnalyser();
      let levels: number[];
      if (analyser) {
        const binCount = analyser.frequencyBinCount;
        if (!buffer || buffer.length !== binCount) {
          buffer = new Uint8Array(binCount);
        }
        analyser.getByteFrequencyData(buffer);
        // 상위 1/4 빈(초고역)은 거의 비어 있어 제외 — 시각 밀도 확보
        const usable = Math.floor(binCount * 0.75);
        levels = Array.from({ length: bars }, (_, i) => {
          const start = Math.floor((i / bars) * usable);
          const end = Math.max(start + 1, Math.floor(((i + 1) / bars) * usable));
          let sum = 0;
          for (let j = start; j < end; j++) sum += buffer![j];
          return sum / (end - start) / 255;
        });
      } else {
        levels = Array.from({ length: bars }, () => 0);
      }

      const gap = 2;
      const barW = (rect.width - gap * (bars - 1)) / bars;
      ctx.fillStyle = color;
      for (let i = 0; i < bars; i++) {
        const v = levels[i];
        const barH = Math.max(2, v * rect.height);
        const x = i * (barW + gap);
        const y = rect.height - barH;
        const r = Math.min(barW / 2, 3);
        ctx.beginPath();
        ctx.roundRect(x, y, barW, barH, [r, r, 0, 0]);
        ctx.fill();
      }
    }

    draw();
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [bars, color]);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
