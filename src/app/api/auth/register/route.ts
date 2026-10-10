import bcrypt from "bcryptjs";
import { z } from "zod";
import { rejectCrossOrigin } from "@/lib/api-auth";
import { errorJson } from "@/lib/api-errors";
import { getDb } from "@/lib/db";
import { createUser, DuplicateError } from "@/lib/db/repo";

const registerSchema = z.object({
  email: z.string().trim().email().max(254),
  // bcrypt는 72바이트까지만 쓰므로 그보다 긴 비밀번호는 받지 않는다.
  password: z.string().min(8).max(72),
  nickname: z.string().trim().min(2).max(20),
});

const BCRYPT_COST = 10;

export async function POST(request: Request) {
  const blocked = rejectCrossOrigin(request);
  if (blocked) return blocked;

  const body = await request.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    const message =
      field === "password"
        ? "비밀번호는 8~72자로 입력해 주세요."
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
