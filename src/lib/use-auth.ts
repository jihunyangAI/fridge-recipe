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

/**
 * 로그인한 사용자의 프로필과 불러오기 실패 여부. 비로그인이면 profile은 null이다.
 * 실패하면 error가 true가 되고, retry()로 다시 불러온다.
 */
export function useProfileState() {
  const { status } = useSession();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    api<Profile>("/api/profile")
      .then((p) => !cancelled && setProfile(p))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [status, attempt]);
  const retry = () => {
    setError(false);
    setAttempt((n) => n + 1);
  };
  return { profile: status === "authenticated" ? profile : null, error, retry };
}

/** 로그인한 사용자의 프로필. 비로그인이거나 불러오지 못했으면 null. */
export function useProfile() {
  return useProfileState().profile;
}
