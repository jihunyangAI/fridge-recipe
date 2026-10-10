import { errorJson, modelErrorResponse } from "@/lib/api-errors";
import { generateRecipes } from "@/lib/recipe-generator";
import { recipeRequestSchema, type RecipesResponse } from "@/lib/recipes";

// 429 재시도와 1회 재생성을 감안한 실행 시간 상한
export const maxDuration = 60;

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

  try {
    const recipes = await generateRecipes(parsed.data);
    return Response.json({ recipes } satisfies RecipesResponse);
  } catch (e) {
    return modelErrorResponse(e, "recipes", "레시피를 만들지 못했어요. 잠시 후 다시 시도해 주세요.");
  }
}
