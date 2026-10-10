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
    /** 해당 키의 기록을 지운다 (예: 로그인에 성공하면 그 이메일의 실패 횟수를 초기화). */
    reset: (...keys: string[]) => {
      for (const k of keys) hits.delete(k);
    },
    /** 테스트용: 모든 기록을 지운다 */
    clear: () => hits.clear(),
    /** 테스트용: 지금 기록 중인 키 개수 */
    size: () => hits.size,
  };
}

type Limiter = ReturnType<typeof createRateLimiter>;

/** 프록시가 넘겨준 클라이언트 IP. 로컬 실행(next dev/start 직접 접속)에는 이 헤더가 없어 null이다. */
export function clientIp(request: Request): string | null {
  return request.headers.get("x-forwarded-for")?.split(",")[0].trim() || request.headers.get("x-real-ip") || null;
}

// 개발 서버의 핫 리로드에도 기록이 유지되도록 globalThis에 둔다.
const g = globalThis as unknown as { limiters?: { login: Limiter; register: Limiter; ai: Limiter } };
g.limiters ??= {
  // PRD F3-4: 로그인 시도는 IP·이메일 기준 15분에 10회
  login: createRateLimiter({ limit: 10, windowMs: 15 * 60_000 }),
  // 가입: IP당 분당 5회. 계정을 대량으로 만드는 것을 막는다.
  register: createRateLimiter({ limit: 5, windowMs: 60_000 }),
  // 사진 인식·레시피 생성(OpenRouter 유료 호출): 로그인했으면 사용자, 아니면 IP 기준으로 라우트마다 분당 10회.
  ai: createRateLimiter({ limit: 10, windowMs: 60_000 }),
};
export const loginLimiter = g.limiters.login;
export const registerLimiter = g.limiters.register;
export const aiLimiter = g.limiters.ai;

export const TOO_MANY_REQUESTS = "요청이 너무 많아요. 잠시 후 다시 시도해 주세요.";
