"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { loginUrl } from "@/lib/api-client";
import { clearPrivateSession } from "@/lib/private-session";

export function SiteHeader() {
  const { status } = useSession();
  const pathname = usePathname();

  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800">
      <nav className="mx-auto flex w-full max-w-2xl items-center justify-between gap-2 px-4 py-3">
        <Link href="/" className="font-bold text-emerald-700 dark:text-emerald-400">
          냉장고부탁해
        </Link>
        <div className="flex items-center gap-3 text-sm">
          {status === "authenticated" ? (
            <>
              <Link href="/my-recipes" className="hover:underline">
                내 레시피
              </Link>
              <Link href="/profile" className="hover:underline">
                프로필
              </Link>
              <button
                type="button"
                onClick={() => {
                  clearPrivateSession();
                  void signOut({ redirectTo: "/" });
                }}
                className="text-zinc-500 hover:underline"
              >
                로그아웃
              </button>
            </>
          ) : status === "unauthenticated" ? (
            <Link href={loginUrl(pathname)} className="rounded-lg border border-zinc-300 px-3 py-1 dark:border-zinc-700">
              로그인
            </Link>
          ) : (
            // 로그인 상태를 확인하는 동안 자리를 비워 두어 헤더가 흔들리지 않게 한다.
            <span aria-hidden className="invisible px-3 py-1">
              로그인
            </span>
          )}
        </div>
      </nav>
    </header>
  );
}
