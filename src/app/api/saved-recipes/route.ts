import { z } from "zod";
import { rejectCrossOrigin, requireUser } from "@/lib/api-auth";
import { errorJson } from "@/lib/api-errors";
import { DuplicateError, LimitError, listSavedRecipes, MAX_SAVED, saveRecipe } from "@/lib/db/repo";
import { recipeSchema, sourceIngredientsSchema } from "@/lib/recipes";

const listQuerySchema = z.object({
  q: z.string().max(60).optional(),
  cuisine: z.string().max(20).optional(),
  page: z.coerce.number().int().min(1).max(1000).catch(1),
});

export async function GET(request: Request) {
  const ctx = await requireUser();
  if (ctx instanceof Response) return ctx;

  const params = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = listQuerySchema.safeParse(params);
  if (!parsed.success) return errorJson(400, "검색 조건이 올바르지 않아요.");
  return Response.json(await listSavedRecipes(ctx.db, ctx.userId, parsed.data));
}

const saveSchema = z.object({ recipe: recipeSchema, sourceIngredients: sourceIngredientsSchema });

export async function POST(request: Request) {
  const blocked = rejectCrossOrigin(request);
  if (blocked) return blocked;
  const ctx = await requireUser();
  if (ctx instanceof Response) return ctx;

  const parsed = saveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorJson(400, "레시피 형식이 올바르지 않아요.");

  try {
    const { id } = await saveRecipe(ctx.db, ctx.userId, parsed.data.recipe, parsed.data.sourceIngredients);
    return Response.json({ id }, { status: 201 });
  } catch (e) {
    if (e instanceof DuplicateError) return errorJson(409, "이미 저장한 레시피예요.");
    if (e instanceof LimitError) return errorJson(409, `레시피는 최대 ${MAX_SAVED}개까지 저장할 수 있어요.`);
    throw e;
  }
}
