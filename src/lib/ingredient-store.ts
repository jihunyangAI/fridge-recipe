"use client";

import { SESSION_KEY, type Ingredient } from "./ingredients";
import { createSessionStore } from "./session-store";

// 확정한 재료 목록. 1단계 → 2단계로 넘어갈 때 공유한다. null은 아직 인식 전이라는 뜻이다.
const store = createSessionStore(SESSION_KEY, (v): v is Ingredient[] =>
  Array.isArray(v) &&
  v.every(
    (i) =>
      typeof i === "object" &&
      i !== null &&
      typeof i.name === "string" &&
      (i.quantity === null || typeof i.quantity === "string") &&
      typeof i.category === "string" &&
      typeof i.confidence === "string",
  ),
);

export const saveIngredients = store.save;
export const useStoredIngredients = store.useValue;
