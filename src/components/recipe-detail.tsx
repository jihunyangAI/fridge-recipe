"use client";

import { useState } from "react";
import { missingCount, type Recipe } from "@/lib/recipes";

export function RecipeMeta({ recipe }: { recipe: Recipe }) {
  const parts = [
    recipe.minutes ? `${recipe.minutes}분` : null,
    recipe.difficulty,
    `${recipe.servings}인분`,
    recipe.cuisine,
  ].filter(Boolean);
  return <p className="text-sm text-zinc-500">{parts.join(" · ")}</p>;
}

export function RecipeCard({ recipe, onOpen }: { recipe: Recipe; onOpen: () => void }) {
  const missing = missingCount(recipe);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full flex-col gap-2 rounded-2xl border border-zinc-200 p-4 text-left transition-colors hover:border-emerald-500 hover:bg-emerald-50/50 dark:border-zinc-800 dark:hover:bg-emerald-950/20"
    >
      <h3 className="text-lg font-semibold">{recipe.title}</h3>
      {recipe.summary && <p className="text-sm text-zinc-600 dark:text-zinc-400">{recipe.summary}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <RecipeMeta recipe={recipe} />
        <span
          className={`rounded-full px-2 py-0.5 text-xs ${
            missing === 0
              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200"
              : "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200"
          }`}
        >
          {missing === 0 ? "재료 모두 있음" : `부족한 재료 ${missing}개`}
        </span>
      </div>
    </button>
  );
}

export function RecipeDetail({
  recipe,
  onBack,
  backLabel = "← 레시피 목록",
  actions,
}: {
  recipe: Recipe;
  onBack: () => void;
  backLabel?: string;
  /** 제목 아래에 붙는 버튼 영역 (저장, 메모, 삭제 등) */
  actions?: React.ReactNode;
}) {
  // 조리 단계 완료 체크는 화면 상태로만 둔다 (저장하지 않음).
  const [done, setDone] = useState<Set<number>>(new Set());
  const toggle = (i: number) =>
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  return (
    <article className="flex flex-col gap-6">
      <button type="button" onClick={onBack} className="self-start text-sm text-zinc-500 underline">
        {backLabel}
      </button>
      <header className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold">{recipe.title}</h2>
        {recipe.summary && <p className="text-zinc-600 dark:text-zinc-400">{recipe.summary}</p>}
        <RecipeMeta recipe={recipe} />
      </header>
      {actions}

      <section className="flex flex-col gap-2">
        <h3 className="font-semibold">재료</h3>
        <ul className="flex flex-col gap-1">
          {recipe.ingredients.map((item, i) => (
            <li
              key={i}
              className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
                item.owned
                  ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100"
                  : "bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
              }`}
            >
              <span>
                {item.name}
                {!item.owned && <span className="ml-2 text-xs font-medium">(없음)</span>}
              </span>
              {item.amount && <span className="text-xs opacity-80">{item.amount}</span>}
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="font-semibold">만드는 법</h3>
        <ol className="flex flex-col gap-2">
          {recipe.steps.map((step, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => toggle(i)}
                aria-pressed={done.has(i)}
                className="flex w-full gap-3 rounded-lg p-2 text-left hover:bg-zinc-100 dark:hover:bg-zinc-900"
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    done.has(i) ? "bg-emerald-600 text-white" : "bg-zinc-200 dark:bg-zinc-800"
                  }`}
                >
                  {done.has(i) ? "✓" : i + 1}
                </span>
                <span className={done.has(i) ? "text-zinc-400 line-through" : ""}>{step}</span>
              </button>
            </li>
          ))}
        </ol>
      </section>

      {recipe.tips && (
        <p className="rounded-lg bg-zinc-50 p-3 text-sm text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
          팁: {recipe.tips}
        </p>
      )}
    </article>
  );
}
