"use client";

import { saveIngredients } from "./ingredient-store";
import { saveRecipeSession } from "./recipe-store";

/** 비로그인 상태에서 "저장"을 누르면 이 키에 레시피 id를 남기고 로그인 화면으로 보낸다. */
export const PENDING_SAVE_KEY = "fridge:pendingSave";

/**
 * 로그아웃·계정 삭제 때 브라우저(sessionStorage)에 남은 개인 데이터를 지운다.
 * 추천 결과는 프로필(알레르기 등)을 반영한 것이고, 보류 중인 저장은 다음 로그인 사용자가 이어서 실행할 수 있으며,
 * 냉장고 재료 목록은 그 사람의 냉장고 사진에서 나온 것이기 때문이다.
 */
export function clearPrivateSession() {
  saveIngredients(null);
  saveRecipeSession(null);
  try {
    sessionStorage.removeItem(PENDING_SAVE_KEY);
  } catch {}
}
