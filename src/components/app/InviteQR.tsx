"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { cn } from "@/lib/utils";

/* ───────────────────────────────────────────
   InviteQR — 초대 링크를 QR 코드(PNG data URL)로 렌더
   bora 톤(어두운 보라 모듈)으로 생성, 실패 시 폴백 메시지.
   ─────────────────────────────────────────── */

export default function InviteQR({
  value,
  size = 200,
  className,
}: {
  value: string;
  size?: number;
  className?: string;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setFailed(false);
    setDataUrl(null);
    QRCode.toDataURL(value, {
      width: size * 2, // 레티나 대응
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#4c1d95", light: "#ffffff" },
    })
      .then((url) => alive && setDataUrl(url))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [value, size]);

  if (failed) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-2xl bg-surface-secondary text-center text-xs text-caption",
          className
        )}
        style={{ width: size, height: size }}
      >
        QR 생성 실패
      </div>
    );
  }

  return (
    <div
      className={cn("overflow-hidden rounded-2xl bg-white p-2 shadow-sm ring-1 ring-strong", className)}
      style={{ width: size, height: size }}
    >
      {dataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- 로컬 생성 data URL
        <img
          src={dataUrl}
          alt="초대 QR 코드"
          className="h-full w-full"
          width={size}
          height={size}
        />
      ) : (
        <div className="h-full w-full animate-pulse rounded-xl bg-surface-secondary" />
      )}
    </div>
  );
}
