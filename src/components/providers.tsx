"use client";

import { SessionProvider } from "next-auth/react";

// 로그인 상태는 브라우저에서 /api/auth/session으로 확인한다.
// 서버 화면에서 쿠키를 읽지 않으므로 cacheComponents의 정적 셸이 그대로 유지된다.
export function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
