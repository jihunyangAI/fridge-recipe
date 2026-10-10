import { Suspense } from "react";
import { LoginForm } from "@/components/auth-forms";

export default function LoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col gap-6 px-4 py-10">
      <h1 className="text-2xl font-bold">로그인</h1>
      {/* useSearchParams(callbackUrl)를 읽으므로 Suspense 안에 둔다 */}
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
