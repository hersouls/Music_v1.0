/* ───────────────────────────────────────────
   서버 라우트 인증 + 경량 레이트리밋 (서버 전용)
   admin SDK 없이 Identity Toolkit accounts:lookup 으로 토큰 검증.
   (웹 API 키만 필요 — 키 자체는 공개 가능한 클라이언트 키)
   ─────────────────────────────────────────── */

/** 토큰 검증 결과 — uid 가 있으면 인증된 활성 사용자 */
export async function verifyIdToken(req: Request): Promise<string | null> {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) return null;
  const idToken = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!idToken) return null;
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      users?: { localId?: string; disabled?: boolean }[];
    };
    const user = data.users?.[0];
    // 비활성(정지) 계정은 거부
    if (!user?.localId || user.disabled) return null;
    return user.localId;
  } catch {
    return null;
  }
}

/* ── 경량 레이트리밋 (인메모리 슬라이딩 윈도) ──
   유료 OpenAI 라우트의 폭주성 남용 방지. 서버 인스턴스별 상태라
   분산 환경에선 완전하지 않지만(인스턴스마다 독립), 무한 루프성
   호출을 인스턴스 단위로 차단한다. 강한 보장이 필요하면 후속으로
   Firestore 카운터/App Check 추가. */

const buckets = new Map<string, number[]>();

export interface RateLimitResult {
  ok: boolean;
  retryAfterSec?: number;
}

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now: number
): RateLimitResult {
  const cutoff = now - windowMs;
  const hits = (buckets.get(key) ?? []).filter((t) => t > cutoff);
  if (hits.length >= limit) {
    const retryAfterSec = Math.ceil((hits[0] + windowMs - now) / 1000);
    buckets.set(key, hits);
    return { ok: false, retryAfterSec: Math.max(1, retryAfterSec) };
  }
  hits.push(now);
  buckets.set(key, hits);
  // 메모리 누수 방지 — 가끔 만료 키 정리
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      const live = v.filter((t) => t > cutoff);
      if (live.length) buckets.set(k, live);
      else buckets.delete(k);
    }
  }
  return { ok: true };
}

export function rateLimitResponse(retryAfterSec?: number): Response {
  return Response.json(
    { error: "요청이 너무 잦습니다 — 잠시 후 다시 시도해 주세요" },
    {
      status: 429,
      headers: retryAfterSec ? { "Retry-After": String(retryAfterSec) } : undefined,
    }
  );
}
