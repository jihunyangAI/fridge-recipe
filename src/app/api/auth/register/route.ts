import bcrypt from "bcryptjs";
import { z } from "zod";
import { rejectCrossOrigin } from "@/lib/api-auth";
import { errorJson } from "@/lib/api-errors";
import { getDb } from "@/lib/db";
import { createUser, DuplicateError } from "@/lib/db/repo";
import { clientIp, registerLimiter, TOO_MANY_REQUESTS } from "@/lib/rate-limit";

const registerSchema = z.object({
  email: z.string().trim().email().max(254),
  // bcrypt는 72"바이트"까지만 쓰고 그 뒤는 조용히 무시한다. 한글은 글자당 3바이트라 글자 수가 아닌 바이트로 센다.
  password: z
    .string()
    .min(8)
    .refine((v) => new TextEncoder().encode(v).length <= MAX_PASSWORD_BYTES),
  nickname: z.string().trim().min(2).max(20),
});

const BCRYPT_COST = 10;
const MAX_PASSWORD_BYTES = 72;

export async function POST(request: Request) {
  const blocked = rejectCrossOrigin(request);
  if (blocked) return blocked;

  // IP를 알 수 없는 로컬 실행에서는 모든 요청이 한 칸을 같이 쓴다. 개인용이라 분당 5회면 충분하다.
  const limiterKey = `ip:${clientIp(request) ?? "anon"}`;
  if (registerLimiter.isLimited(limiterKey)) return errorJson(429, TOO_MANY_REQUESTS);
  registerLimiter.hit(limiterKey);

  const body = await request.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    const message =
      field === "password"
        ? "비밀번호는 8자 이상, 72바이트(한글 약 24자) 이하로 입력해 주세요."
        : field === "nickname"
          ? "닉네임은 2~20자로 입력해 주세요."
          : "이메일 형식이 올바르지 않아요.";
    return errorJson(400, message);
  }

  const { email, password, nickname } = parsed.data;
  try {
    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    const { id } = await createUser(await getDb(), { email, passwordHash, nickname });
    return Response.json({ id }, { status: 201 });
  } catch (e) {
    if (e instanceof DuplicateError) return errorJson(409, "이미 가입된 이메일이에요.");
    throw e;
  }
}
