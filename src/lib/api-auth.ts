import "server-only";
import { auth } from "@/auth";
import { errorJson } from "./api-errors";
import { getDb, type Db } from "./db";
import { userExists } from "./db/repo";

export type AuthedContext = { userId: string; db: Db };

/**
 * 로그인한 사용자를 확인한다. 세션이 없거나 계정이 지워졌으면(토큰은 남아 있어도) 401 응답을 돌려준다.
 */
export async function requireUser(): Promise<AuthedContext | Response> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return errorJson(401, "로그인이 필요해요.");
  const db = await getDb();
  if (!(await userExists(db, userId))) return errorJson(401, "로그인이 필요해요.");
  return { userId, db };
}

/** 로그인했으면 사용자 정보를, 아니면 null을 돌려준다 (비로그인도 쓸 수 있는 API용). */
export async function optionalUser(): Promise<AuthedContext | null> {
  const result = await requireUser();
  return result instanceof Response ? null : result;
}

/**
 * 상태를 바꾸는 요청이 우리 화면에서 왔는지 Origin 헤더로 확인한다.
 * 세션 쿠키(SameSite=Lax)와 함께 다른 사이트에서 보내는 위조 요청(CSRF)을 막는다.
 */
export function rejectCrossOrigin(request: Request): Response | null {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) return errorJson(403, "허용되지 않은 요청이에요.");
  try {
    if (new URL(origin).host === host) return null;
  } catch {}
  return errorJson(403, "허용되지 않은 요청이에요.");
}
