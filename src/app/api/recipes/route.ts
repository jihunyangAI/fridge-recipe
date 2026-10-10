import { optionalUser } from "@/lib/api-auth";
import { errorJson, modelErrorResponse } from "@/lib/api-errors";
import { getProfile } from "@/lib/db/repo";
import type { Profile } from "@/lib/profile";
import { generateRecipes } from "@/lib/recipe-generator";
import { ALLERGY_NOTICE, DIET_NOTICE, recipeRequestSchema, type RecipesResponse } from "@/lib/recipes";

// 429 재시도와 1회 재생성을 감안한 실행 시간 상한
export const maxDuration = 60;

function noticeFor(profile: Profile | null): string | null {
  if (!profile) return null;
  if (profile.allergies.length > 0) return ALLERGY_NOTICE;
  if (profile.dislikedIngredients.length > 0 || profile.dietType !== "일반") return DIET_NOTICE;
  return null;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorJson(400, "요청 형식이 올바르지 않아요.");
  }

  const parsed = recipeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorJson(400, "재료는 1~50개, 이름은 30자 이하로 보내 주세요.");
  }

  // 비로그인도 쓸 수 있다. 로그인했으면 프로필(알레르기·싫어하는 재료·식단)을 반영한다.
  const user = await optionalUser();
  const profile = user ? await getProfile(user.db, user.userId) : null;

  try {
    const recipes = await generateRecipes(parsed.data, undefined, profile);
    return Response.json({ recipes, profileNotice: noticeFor(profile) } satisfies RecipesResponse);
  } catch (e) {
    return modelErrorResponse(e, "recipes", "레시피를 만들지 못했어요. 잠시 후 다시 시도해 주세요.");
  }
}
