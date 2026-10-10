"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { api, ApiError } from "@/lib/api-client";
import { ALLERGEN_OPTIONS, DIET_TYPES, type Profile } from "@/lib/profile";
import { SERVINGS } from "@/lib/recipes";
import { clearPrivateSession } from "@/lib/private-session";
import { useProfileState, useRequireAuth } from "@/lib/use-auth";
import { ErrorText, Field } from "./auth-forms";

export function ProfilePage() {
  const status = useRequireAuth();
  const { profile, error, retry } = useProfileState();
  if (status === "authenticated" && error) {
    return (
      <div className="flex flex-col items-start gap-3">
        <ErrorText>프로필을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</ErrorText>
        <button type="button" onClick={retry} className="btn-secondary">
          다시 시도
        </button>
      </div>
    );
  }
  if (status !== "authenticated" || !profile) return <p className="text-zinc-500">불러오는 중…</p>;
  // 불러온 값으로 폼을 한 번만 초기화한다.
  return <ProfileForm initial={profile} />;
}

function ProfileForm({ initial }: { initial: Profile }) {
  const [form, setForm] = useState<Profile>(initial);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Profile>(key: K, value: Profile[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setMessage(null);
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      setForm(await api<Profile>("/api/profile", { method: "PUT", json: form }));
      setMessage({ ok: true, text: "저장했어요. 다음 레시피 추천부터 반영돼요." });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof ApiError ? err.message : "저장하지 못했어요." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-10">
      <form onSubmit={save} className="flex flex-col gap-6">
        <Field label="닉네임" hint="2~20자">
          <input
            required
            minLength={2}
            maxLength={20}
            value={form.nickname}
            onChange={(e) => set("nickname", e.target.value)}
            className="input w-full"
          />
        </Field>

        <TagPicker
          label="알레르기"
          hint="레시피에서 완전히 빼요"
          options={ALLERGEN_OPTIONS}
          value={form.allergies}
          onChange={(v) => set("allergies", v)}
          max={20}
        />
        <TagPicker
          label="싫어하는 재료"
          hint="가능하면 빼요"
          options={[]}
          value={form.dislikedIngredients}
          onChange={(v) => set("dislikedIngredients", v)}
          max={30}
        />

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">식단</legend>
          <div className="flex flex-wrap gap-2">
            {DIET_TYPES.map((d) => (
              <Chip key={d} selected={form.dietType === d} onClick={() => set("dietType", d)}>
                {d}
              </Chip>
            ))}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">기본 인분</legend>
          <div className="flex flex-wrap gap-2">
            {SERVINGS.map((n) => (
              <Chip key={n} selected={form.defaultServings === n} onClick={() => set("defaultServings", n)}>
                {n}인분
              </Chip>
            ))}
          </div>
        </fieldset>

        {message &&
          (message.ok ? (
            <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
              {message.text}
            </p>
          ) : (
            <ErrorText>{message.text}</ErrorText>
          ))}
        <button type="submit" disabled={busy} className="btn-primary">
          {busy ? "저장 중…" : "프로필 저장"}
        </button>
      </form>

      <section className="flex flex-col gap-3 border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <button
          type="button"
          onClick={() => {
            clearPrivateSession();
            void signOut({ redirectTo: "/" });
          }}
          className="btn-secondary self-start"
        >
          로그아웃
        </button>
        <DeleteAccount
          onDeleted={async () => {
            // 계정은 이미 지워졌다. 로그아웃 처리가 실패해도 삭제 실패로 보이지 않게 하고 첫 화면으로 보낸다.
            // (남은 로그인 토큰은 다음 API 호출의 401에서 정리된다.)
            // redirect: false로 세션만 갱신하면 useRequireAuth가 먼저 로그인 화면으로 보내므로, 페이지 이동으로 로그아웃한다.
            clearPrivateSession();
            await signOut({ redirectTo: "/" }).catch(() => window.location.replace("/"));
          }}
        />
      </section>
    </div>
  );
}

function DeleteAccount({ onDeleted }: { onDeleted: () => Promise<void> }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className="self-start text-sm text-red-600 underline">
        계정 삭제
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-red-200 p-3 dark:border-red-900">
      <p className="text-sm">계정을 삭제하면 프로필과 저장한 레시피가 모두 지워지고 되돌릴 수 없어요.</p>
      {error && <ErrorText>{error}</ErrorText>}
      <div className="flex flex-wrap gap-2">
        {/* 안전한 선택(취소)을 먼저, 크게 두고 위험한 삭제는 윤곽선만 있는 버튼으로 낮춘다. */}
        <button type="button" onClick={() => setConfirming(false)} className="btn-secondary font-semibold">
          취소
        </button>
        <button
          type="button"
          onClick={async () => {
            try {
              await api("/api/profile", { method: "DELETE" });
            } catch (err) {
              setError(err instanceof ApiError ? err.message : "삭제하지 못했어요.");
              return;
            }
            await onDeleted();
          }}
          className="rounded-xl border border-red-300 px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/40"
        >
          계정 영구 삭제
        </button>
      </div>
    </div>
  );
}

function TagPicker({
  label,
  hint,
  options,
  value,
  onChange,
  max,
}: {
  label: string;
  hint: string;
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
  max: number;
}) {
  const [draft, setDraft] = useState("");
  const toggle = (item: string) =>
    onChange(value.includes(item) ? value.filter((v) => v !== item) : [...value, item].slice(0, max));
  // 미리 정의한 선택지에 없는 항목(직접 입력)도 칩으로 보여준다.
  const custom = value.filter((v) => !options.includes(v));

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium">
        {label} <span className="font-normal text-zinc-500">({hint})</span>
      </legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <Chip key={o} selected={value.includes(o)} onClick={() => toggle(o)}>
            {o}
          </Chip>
        ))}
        {custom.map((c) => (
          <Chip key={c} selected onClick={() => toggle(c)}>
            {c} ✕
          </Chip>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          aria-label={`${label} 직접 입력`}
          placeholder="직접 입력"
          value={draft}
          maxLength={20}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              const item = draft.trim();
              if (item && !value.includes(item)) onChange([...value, item].slice(0, max));
              setDraft("");
            }
          }}
          className="input min-w-0 flex-1"
        />
        <button
          type="button"
          disabled={!draft.trim()}
          onClick={() => {
            const item = draft.trim();
            if (item && !value.includes(item)) onChange([...value, item].slice(0, max));
            setDraft("");
          }}
          className="btn-secondary"
        >
          추가
        </button>
      </div>
    </fieldset>
  );
}

export function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
        selected
          ? "border-emerald-600 bg-emerald-600 text-white"
          : "border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
      }`}
    >
      {children}
    </button>
  );
}
