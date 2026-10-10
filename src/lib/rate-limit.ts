import "server-only";

/**
 * 메모리 기반 고정 창 카운터. 로컬 단일 프로세스 앱이라 외부 저장소 없이 충분하다
 * (서버를 재시작하면 기록이 사라진다).
 */
export function createRateLimiter({
  limit,
  windowMs,
  now = Date.now,
  sweepAt = 1000,
}: {
  limit: number;
  windowMs: number;
  now?: () => number;
  /** 기록된 키가 이 개수를 넘으면 만료된 키를 한꺼번에 지운다 (처음 보는 이메일마다 키가 늘어나므로). */
  sweepAt?: number;
}) {
  const hits = new Map<string, number[]>();
  const sweep = () => {
    const cutoff = now() - windowMs;
    for (const [key, list] of hits) if (!list.some((t) => t > cutoff)) hits.delete(key);
  };

  const recent = (key: string) => {
    const cutoff = now() - windowMs;
    const list = (hits.get(key) ?? []).filter((t) => t > cutoff);
    if (list.length) hits.set(key, list);
    else hits.delete(key);
    return list;
  };

  return {
    /** keys 중 하나라도 한도에 도달했으면 true */
    isLimited: (...keys: string[]) => keys.some((k) => recent(k).length >= limit),
    hit: (...keys: string[]) => {
      for (const k of keys) hits.set(k, [...recent(k), now()]);
      if (hits.size > sweepAt) sweep();
    },
    /** 테스트용: 지금 기록 중인 키 개수 */
    size: () => hits.size,
  };
}

// PRD F3-4: 로그인 시도는 IP·이메일 기준 15분에 10회
const globalForLimiter = globalThis as unknown as { loginLimiter?: ReturnType<typeof createRateLimiter> };
export const loginLimiter = (globalForLimiter.loginLimiter ??= createRateLimiter({ limit: 10, windowMs: 15 * 60_000 }));
