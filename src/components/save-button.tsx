"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { api, ApiError, loginUrl } from "@/lib/api-client";
import { PENDING_SAVE_KEY as PENDING_KEY } from "@/lib/private-session";
import type { Recipe, SourceIngredient } from "@/lib/recipes";

// 비로그인 상태에서 "저장"을 누르면 PENDING_KEY에 레시피 id를 남기고 로그인 화면으로 보낸다.
// 로그인 후 레시피 화면으로 돌아오면 같은 레시피의 SaveButton이 이어서 저장한다.

type State = { kind: "idle" | "saving" | "saved" } | { kind: "error"; message: string };

/** 저장 요청을 보내고 결과 상태를 돌려준다. */
async function postSave(recipe: Recipe, sourceIngredients: SourceIngredient[]): Promise<State> {
  try {
    await api("/api/saved-recipes", { method: "POST", json: { recipe, sourceIngredients } });
    return { kind: "saved" };
  } catch (e) {
    if (e instanceof ApiError && e.status === 409 && e.message.includes("이미 저장")) return { kind: "saved" };
    return { kind: "error", message: e instanceof ApiError ? e.message : "저장하지 못했어요." };
  }
}

async function isAlreadySaved(recipeId: string): Promise<boolean> {
  const { saved } = await api<{ saved: Record<string, string> }>(
    `/api/saved-recipes/lookup?recipeIds=${encodeURIComponent(recipeId)}`,
  ).catch(() => ({ saved: {} as Record<string, string> }));
  return !!saved[recipeId];
}

/** 로그인 전에 이 레시피의 저장을 눌렀었다면 그 기록을 지우고 true를 돌려준다. */
function takePendingSave(recipeId: string): boolean {
  try {
    if (sessionStorage.getItem(PENDING_KEY) !== recipeId) return false;
    sessionStorage.removeItem(PENDING_KEY);
    return true;
  } catch {
    return false;
  }
}

export function SaveButton({ recipe, sourceIngredients }: { recipe: Recipe; sourceIngredients: SourceIngredient[] }) {
  const { status } = useSession();
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "idle" });

  // 부모가 렌더마다 새 배열을 넘기므로, 아래 효과가 그 때문에 다시 돌지 않도록 최신 값을 ref로 본다.
  const latest = useRef({ recipe, sourceIngredients });
  useEffect(() => {
    latest.current = { recipe, sourceIngredients };
  });

  // 로그인 상태가 정해지면: 로그인 전에 누른 저장을 이어서 하거나, 이미 저장했는지 확인한다.
  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    const work: Promise<State | null> = takePendingSave(recipe.id)
      ? postSave(latest.current.recipe, latest.current.sourceIngredients)
      : isAlreadySaved(recipe.id).then((saved) => (saved ? { kind: "saved" } : null));
    work.then((next) => {
      if (!cancelled && next) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [status, recipe.id]);

  const save = async () => {
    setState({ kind: "saving" });
    setState(await postSave(recipe, sourceIngredients));
  };

  function onClick() {
    if (status === "unauthenticated") {
      try {
        sessionStorage.setItem(PENDING_KEY, recipe.id);
      } catch {}
      router.push(loginUrl("/recipes"));
      return;
    }
    void save();
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={state.kind === "saving" || state.kind === "saved" || status === "loading"}
        className={state.kind === "saved" ? "btn-secondary" : "btn-primary"}
      >
        {state.kind === "saved" ? "✓ 저장됨" : state.kind === "saving" ? "저장 중…" : "레시피 저장"}
      </button>
      {state.kind === "saved" && (
        <Link href="/my-recipes" className="text-sm text-emerald-700 underline dark:text-emerald-400">
          내 레시피에서 보기 →
        </Link>
      )}
      {state.kind === "error" && (
        <p role="alert" className="text-sm text-red-600">
          {state.message}
        </p>
      )}
      {status === "unauthenticated" && state.kind === "idle" && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">저장하려면 로그인이 필요해요. 누르면 로그인 화면으로 이동해요.</p>
      )}
    </div>
  );
}
