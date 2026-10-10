"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { api, ApiError, safeCallbackUrl } from "@/lib/api-client";

const LOGIN_FAILED = "이메일 또는 비밀번호가 올바르지 않습니다";
const RATE_LIMITED = "로그인 시도가 너무 많아요. 15분 뒤에 다시 시도해 주세요.";

async function logIn(email: string, password: string): Promise<string | null> {
  const result = await signIn("credentials", { email, password, redirect: false });
  if (!result?.error) return null;
  return result.code === "rate_limited" ? RATE_LIMITED : LOGIN_FAILED;
}

function useCallbackUrl() {
  return safeCallbackUrl(useSearchParams().get("callbackUrl"));
}

export function LoginForm() {
  const router = useRouter();
  const callbackUrl = useCallbackUrl();
  const joined = useSearchParams().get("joined") === "1";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const failure = await logIn(email, password).catch(() => "로그인하지 못했어요. 잠시 후 다시 시도해 주세요.");
        setBusy(false);
        if (failure) setError(failure);
        else {
          router.replace(callbackUrl);
          router.refresh();
        }
      }}
    >
      <Field label="이메일">
        <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input w-full" />
      </Field>
      <Field label="비밀번호">
        <input
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="input w-full"
        />
      </Field>
      {joined && !error && (
        <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
          가입은 완료됐어요. 로그인해 주세요.
        </p>
      )}
      {error && <ErrorText>{error}</ErrorText>}
      <button type="submit" disabled={busy} className="btn-primary">
        {busy ? "로그인 중…" : "로그인"}
      </button>
      <p className="text-center text-sm text-zinc-500">
        처음이신가요?{" "}
        <Link href={`/signup?callbackUrl=${encodeURIComponent(callbackUrl)}`} className="text-emerald-700 underline dark:text-emerald-400">
          회원가입
        </Link>
      </p>
    </form>
  );
}

export function SignupForm() {
  const router = useRouter();
  const callbackUrl = useCallbackUrl();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await api("/api/auth/register", { method: "POST", json: { email, password, nickname } });
          // 가입하면 바로 로그인시켜 원래 보던 화면으로 돌려보낸다.
          const failure = await logIn(email, password);
          if (failure) {
            // 계정은 이미 만들어졌다. 다시 가입하면 "이미 가입된 이메일"이 되므로 로그인 화면으로 보낸다.
            router.replace(`/login?joined=1&callbackUrl=${encodeURIComponent(callbackUrl)}`);
            return;
          }
          router.replace(callbackUrl);
          router.refresh();
        } catch (err) {
          setError(err instanceof ApiError || err instanceof Error ? err.message : "가입하지 못했어요.");
          setBusy(false);
        }
      }}
    >
      <Field label="이메일">
        <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input w-full" />
      </Field>
      <Field label="비밀번호" hint="8자 이상">
        <input
          type="password"
          required
          minLength={8}
          maxLength={72}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="input w-full"
        />
      </Field>
      <Field label="닉네임" hint="2~20자">
        <input
          required
          minLength={2}
          maxLength={20}
          autoComplete="nickname"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          className="input w-full"
        />
      </Field>
      {error && <ErrorText>{error}</ErrorText>}
      <button type="submit" disabled={busy} className="btn-primary">
        {busy ? "가입 중…" : "가입하고 시작하기"}
      </button>
      <p className="text-center text-sm text-zinc-500">
        이미 계정이 있나요?{" "}
        <Link href={`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`} className="text-emerald-700 underline dark:text-emerald-400">
          로그인
        </Link>
      </p>
    </form>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">
        {label} {hint && <span className="font-normal text-zinc-500">({hint})</span>}
      </span>
      {children}
    </label>
  );
}

export function ErrorText({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
      {children}
    </p>
  );
}
