"use client";

import type { Ingredient } from "./ingredients";
import type { Recipe, RecipeOptions } from "./recipes";
import { createSessionStore } from "./session-store";

export type RecipeSession = {
  /** 이 결과를 만들 때 쓴 재료. 1단계에서 재료를 바꾸면 결과를 버리는 데 쓴다. */
  ingredientsKey: string;
  options: RecipeOptions;
  recipes: Recipe[];
  /** "다른 레시피 보기"에서 제외할, 지금까지 나온 모든 레시피 제목 */
  seenTitles: string[];
  /** 서버가 프로필(알레르기 등)을 반영했을 때의 안내 문구 */
  profileNotice?: string | null;
  /** 이 결과에 적용된 알레르기(allergyKey). 로그인·프로필 변경 뒤 결과가 낡았는지 판단한다. */
  allergyKey?: string;
  /** 상세를 보고 있는 레시피 id. 로그인하러 갔다 와도 같은 레시피로 돌아오기 위해 저장한다. */
  openId?: string | null;
};

const store = createSessionStore(
  "fridge:recipes",
  (v): v is RecipeSession =>
    typeof v === "object" && v !== null && Array.isArray((v as RecipeSession).recipes),
);

export const saveRecipeSession = store.save;
export const useRecipeSession = store.useValue;

export const ingredientsKey = (ingredients: Ingredient[]) =>
  JSON.stringify(ingredients.map((i) => [i.name, i.quantity]));
