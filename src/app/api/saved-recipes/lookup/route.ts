import { requireUser } from "@/lib/api-auth";
import { findSavedByRecipeIds } from "@/lib/db/repo";

/** GET /api/saved-recipes/lookup?recipeIds=a,b,c → { saved: { [recipeId]: savedId } } ("저장됨" 표시용) */
export async function GET(request: Request) {
  const ctx = await requireUser();
  if (ctx instanceof Response) return ctx;
  const ids = (new URL(request.url).searchParams.get("recipeIds") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s && s.length <= 64)
    .slice(0, 30);
  return Response.json({ saved: await findSavedByRecipeIds(ctx.db, ctx.userId, ids) });
}
