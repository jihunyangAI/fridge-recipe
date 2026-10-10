"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { api, loginUrl } from "./api-client";
import type { Profile } from "./profile";

/** 로그인이 필요한 화면에서 쓴다. 로그인 안 했으면 로그인 화면으로 보내고, 돌아올 주소를 넘긴다. */
export function useRequireAuth() {
  const { status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (status === "unauthenticated") router.replace(loginUrl(pathname));
  }, [status, router, pathname]);
  return status;
}

/** 로그인한 사용자의 프로필. 비로그인이면 null. */
export function useProfile() {
  const { status } = useSession();
  const [profile, setProfile] = useState<Profile | null>(null);
  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    api<Profile>("/api/profile")
      .then((p) => !cancelled && setProfile(p))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [status]);
  return status === "authenticated" ? profile : null;
}
