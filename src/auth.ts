import "server-only";
import bcrypt from "bcryptjs";
import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { findUserByEmail, normalizeEmail } from "@/lib/db/repo";
import { loginLimiter } from "@/lib/rate-limit";

class RateLimited extends CredentialsSignin {
  code = "rate_limited";
}

const credentialsSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(72),
});

// 존재하지 않는 이메일에도 bcrypt 비교를 한 번 해서, 응답 시간으로 계정 존재 여부가 드러나지 않게 한다.
const DUMMY_HASH = bcrypt.hashSync("dummy-password-for-timing", 10);

/** 프록시가 넘겨준 클라이언트 IP. 로컬 실행(next dev/start 직접 접속)에는 이 헤더가 없어 null이다. */
function clientIp(request: Request): string | null {
  return request.headers.get("x-forwarded-for")?.split(",")[0].trim() || request.headers.get("x-real-ip") || null;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  // 로컬(next start 포함)에서 호스트 검사를 통과시킨다. 배포한다면 AUTH_URL을 정하고 이 값을 다시 본다.
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw, request) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const email = normalizeEmail(parsed.data.email);

        // IP를 알 수 없으면(로컬) 모든 요청이 한 칸을 같이 써서 서로를 막게 되므로, 그때는 이메일 기준만 쓴다.
        const ip = clientIp(request);
        const keys = ip ? [`ip:${ip}`, `email:${email}`] : [`email:${email}`];
        if (loginLimiter.isLimited(...keys)) throw new RateLimited();
        loginLimiter.hit(...keys);

        const user = await findUserByEmail(await getDb(), email);
        const ok = await bcrypt.compare(parsed.data.password, user?.passwordHash ?? DUMMY_HASH);
        // 실패 이유(이메일 없음/비밀번호 틀림)를 구분하지 않는다 (F3-3).
        if (!user || !ok) return null;
        return { id: user.id, email: user.email };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
});
