// API 라우트 테스트용 공통 준비물. vi.mock은 각 테스트 파일 맨 위에서 이 파일의 값을 써서 선언한다.
//
//   vi.mock("@/auth", () => ({ auth: () => testAuth.session() }));
//   vi.mock("@/lib/db", async (orig) => ({ ...(await orig()), getDb: () => testDb.get() }));
import { openDb, type Db } from "@/lib/db";

let session: { user: { id: string } } | null = null;
export const testAuth = {
  session: async () => session,
  signInAs: (userId: string | null) => {
    session = userId ? { user: { id: userId } } : null;
  },
};

let current: Promise<Db> | null = null;
export const testDb = {
  get: () => (current ??= openDb(":memory:")),
  reset: () => {
    current = openDb(":memory:");
    return current;
  },
};

export const ORIGIN = "http://localhost:3000";

/** 같은 출처(Origin) 헤더를 붙인 JSON 요청 */
export function jsonRequest(path: string, method: string, body?: unknown, origin: string | null = ORIGIN) {
  const headers: Record<string, string> = { host: "localhost:3000", "content-type": "application/json" };
  if (origin) headers.origin = origin;
  return new Request(`${ORIGIN}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** Next가 동적 라우트 핸들러에 넘기는 두 번째 인자 */
export const routeParams = <T extends Record<string, string>>(params: T) => ({ params: Promise.resolve(params) });
