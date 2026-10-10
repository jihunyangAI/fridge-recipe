"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStoredIngredients } from "@/lib/ingredient-store";
import { ingredientsKey, saveRecipeSession, useRecipeSession } from "@/lib/recipe-store";
import {
  CUISINES,
  DEFAULT_OPTIONS,
  DIFFICULTIES,
  SERVINGS,
  TIME_LIMITS,
  allergyKey,
  toSourceIngredients,
  type RecipeOptions,
  type RecipesResponse,
} from "@/lib/recipes";
import { useHydrated } from "@/lib/session-store";
import { useProfile } from "@/lib/use-auth";
import { RecipeCard, RecipeDetail } from "./recipe-detail";
import { SaveButton } from "./save-button";

const REQUEST_TIMEOUT_MS = 60_000;
const SLOW_HINT_MS = 15_000;
const MAX_EXCLUDED = 30;

export function RecipePlanner() {
  const router = useRouter();
  const hydrated = useHydrated();
  const ingredients = useStoredIngredients();
  const session = useRecipeSession();
  const profile = useProfile();

  const key = ingredients ? ingredientsKey(ingredients) : null;
  // 1단계에서 재료를 바꿨다면 예전 결과는 보여주지 않는다.
  const current = session && session.ingredientsKey === key ? session : null;

  const [draft, setDraft] = useState<RecipeOptions | null>(null);
  // 처음 조건의 인분은 프로필의 기본 인분을 따른다.
  const options = draft ?? current?.options ?? { ...DEFAULT_OPTIONS, servings: profile?.defaultServings ?? DEFAULT_OPTIONS.servings };
  const setOption = <K extends keyof RecipeOptions>(name: K, value: RecipeOptions[K]) =>
    setDraft({ ...options, [name]: value });

  const [loading, setLoading] = useState(false);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const hasIngredients = !!ingredients && ingredients.length > 0;
  useEffect(() => {
    if (hydrated && !hasIngredients) router.replace("/");
  }, [hydrated, hasIngredients, router]);

  if (!hydrated || !ingredients || !key || !hasIngredients) return null;

  const setSelectedId = (openId: string | null) => {
    if (current) saveRecipeSession({ ...current, openId });
  };

  async function generate(more: boolean) {
    if (!ingredients || !key) return;
    const seenBefore = more ? (current?.seenTitles ?? []) : [];
    setLoading(true);
    setSlow(false);
    setError(null);
    setNotice(null);
    const slowTimer = setTimeout(() => setSlow(true), SLOW_HINT_MS);

    try {
      const res = await fetch("/api/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ingredients: toSourceIngredients(ingredients),
          options,
          excludeTitles: seenBefore.slice(-MAX_EXCLUDED),
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "레시피를 만들지 못했어요. 잠시 후 다시 시도해 주세요.");

      const { recipes, profileNotice, appliedAllergies } = body as RecipesResponse;
      if (more && recipes.length === 0) {
        // 다른 레시피를 못 찾았으면 지금 보던 결과는 그대로 둔다.
        setNotice("더 이상 다른 레시피를 찾지 못했어요. 조건을 바꿔 보세요.");
        return;
      }
      saveRecipeSession({
        ingredientsKey: key,
        options,
        recipes,
        seenTitles: [...seenBefore, ...recipes.map((r) => r.title)],
        profileNotice,
        allergyKey: allergyKey(appliedAllergies ?? []),
        openId: null,
      });
      setDraft(null);
    } catch (e) {
      const timedOut = e instanceof DOMException && e.name === "TimeoutError";
      setError(
        timedOut
          ? "응답이 너무 오래 걸려요. 잠시 후 다시 시도해 주세요."
          : e instanceof Error
            ? e.message
            : "알 수 없는 오류가 발생했어요.",
      );
    } finally {
      clearTimeout(slowTimer);
      setLoading(false);
    }
  }

  // 로그인 전이나 알레르기를 바꾸기 전에 만든 결과는 지금 프로필의 알레르기가 걸러지지 않았다.
  const staleForAllergies =
    !!current &&
    !!profile &&
    profile.allergies.length > 0 &&
    allergyKey(profile.allergies) !== (current.allergyKey ?? "");
  const staleWarning = staleForAllergies && (
    <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
      프로필의 알레르기가 반영되기 전에 만든 레시피예요. 재료를 꼭 확인하거나, 조건을 그대로 두고 다시 만들어 주세요.
    </p>
  );

  const selected = current?.recipes.find((r) => r.id === current.openId);
  if (selected) {
    return (
      <RecipeDetail
        recipe={selected}
        onBack={() => setSelectedId(null)}
        actions={
          <div className="flex flex-col gap-3">
            {staleWarning}
            <SaveButton recipe={selected} sourceIngredients={toSourceIngredients(ingredients)} />
          </div>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold">사용할 재료 ({ingredients.length})</h2>
          <Link href="/" className="text-sm text-zinc-500 underline">
            재료 수정하기
          </Link>
        </div>
        <ul className="flex flex-wrap gap-2">
          {ingredients.map((item, i) => (
            <li
              key={i}
              className="rounded-full bg-emerald-100 px-3 py-1 text-sm text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100"
            >
              {item.name}
              {item.quantity && <span className="text-emerald-700 dark:text-emerald-300"> · {item.quantity}</span>}
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-4 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
        <Segmented
          label="조리 시간"
          value={options.maxMinutes}
          choices={[...TIME_LIMITS.map((m) => ({ value: m, label: `${m}분 이내` })), { value: null, label: "상관없음" }]}
          onChange={(v) => setOption("maxMinutes", v)}
        />
        <Segmented
          label="난이도"
          value={options.difficulty}
          choices={[...DIFFICULTIES.map((d) => ({ value: d, label: d })), { value: null, label: "상관없음" }]}
          onChange={(v) => setOption("difficulty", v)}
        />
        <Segmented
          label="인분"
          value={options.servings}
          choices={SERVINGS.map((n) => ({ value: n, label: `${n}인분` }))}
          onChange={(v) => setOption("servings", v)}
        />
        <Segmented
          label="요리 종류"
          value={options.cuisine}
          choices={[...CUISINES.map((c) => ({ value: c, label: c })), { value: null, label: "상관없음" }]}
          onChange={(v) => setOption("cuisine", v)}
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={options.assumePantry}
            onChange={(e) => setOption("assumePantry", e.target.checked)}
            className="h-4 w-4 accent-emerald-600"
          />
          기본 양념(소금, 후추, 간장, 설탕, 식용유, 참기름, 다진 마늘)은 집에 있어요
        </label>
        <button type="button" onClick={() => generate(false)} disabled={loading} className="btn-primary">
          {loading ? "레시피를 만드는 중…" : current ? "이 조건으로 다시 만들기" : "레시피 만들기"}
        </button>
        {loading && slow && (
          <p className="text-sm text-amber-600" role="status">
            요청이 많아 다시 시도하는 중이에요. 최대 1분 정도 걸릴 수 있어요…
          </p>
        )}
      </section>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      {loading ? (
        <RecipeSkeletons />
      ) : (
        current && (
          <section className="flex flex-col gap-3">
            {current.recipes.length === 0 ? (
              <>
                <p className="text-zinc-600 dark:text-zinc-400">
                  조건에 맞는 레시피를 찾지 못했어요. 조건을 줄여 보세요.
                </p>
                {current.profileNotice && <p className="text-sm text-zinc-500">{current.profileNotice}</p>}
              </>
            ) : (
              <>
                <h2 className="text-xl font-semibold">추천 레시피</h2>
                {staleWarning}
                {!staleForAllergies && current.profileNotice && (
                  <p role="note" className="rounded-lg bg-sky-50 p-3 text-sm text-sky-900 dark:bg-sky-950/40 dark:text-sky-100">
                    {current.profileNotice}
                  </p>
                )}
                {current.recipes.map((recipe) => (
                  <RecipeCard
                    key={recipe.id}
                    recipe={recipe}
                    onOpen={() => {
                      setSelectedId(recipe.id);
                      window.scrollTo({ top: 0 });
                    }}
                  />
                ))}
                {notice && (
                  <p role="status" className="text-sm text-zinc-500">
                    {notice}
                  </p>
                )}
                <button type="button" onClick={() => generate(true)} className="btn-secondary self-center">
                  다른 레시피 보기
                </button>
              </>
            )}
          </section>
        )
      )}
    </div>
  );
}

type Choice<T> = { value: T; label: string };

function Segmented<T extends string | number | null>({
  label,
  value,
  choices,
  onChange,
}: {
  label: string;
  value: T;
  choices: Choice<T>[];
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium text-zinc-500">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {choices.map((c) => (
          <button
            key={String(c.value)}
            type="button"
            aria-pressed={c.value === value}
            onClick={() => onChange(c.value)}
            className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
              c.value === value
                ? "border-emerald-600 bg-emerald-600 text-white"
                : "border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function RecipeSkeletons() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="레시피를 만드는 중">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex animate-pulse flex-col gap-3 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
          <div className="h-5 w-1/2 rounded bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-4 w-5/6 rounded bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-3 w-1/3 rounded bg-zinc-200 dark:bg-zinc-800" />
        </div>
      ))}
    </div>
  );
}
