import { z } from "zod";
import { rejectCrossOrigin, requireUser } from "@/lib/api-auth";
import { errorJson } from "@/lib/api-errors";
import { deleteSavedRecipe, getSavedRecipe, updateMemo } from "@/lib/db/repo";

// 다른 사용자의 레시피는 존재하지 않는 것과 똑같이 404로 응답한다.
const notFound = () => errorJson(404, "레시피를 찾을 수 없어요.");

export async function GET(_request: Request, { params }: RouteContext<"/api/saved-recipes/[id]">) {
  const ctx = await requireUser();
  if (ctx instanceof Response) return ctx;
  const saved = await getSavedRecipe(ctx.db, ctx.userId, (await params).id);
  return saved ? Response.json(saved) : notFound();
}

const memoSchema = z.object({
  memo: z
    .string()
    .max(500)
    .nullable()
    .transform((v) => (v?.trim() ? v.trim() : null)),
});

export async function PATCH(request: Request, { params }: RouteContext<"/api/saved-recipes/[id]">) {
  const blocked = rejectCrossOrigin(request);
  if (blocked) return blocked;
  const ctx = await requireUser();
  if (ctx instanceof Response) return ctx;

  const parsed = memoSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorJson(400, "메모는 500자까지 쓸 수 있어요.");
  const ok = await updateMemo(ctx.db, ctx.userId, (await params).id, parsed.data.memo);
  return ok ? Response.json({ memo: parsed.data.memo }) : notFound();
}

export async function DELETE(request: Request, { params }: RouteContext<"/api/saved-recipes/[id]">) {
  const blocked = rejectCrossOrigin(request);
  if (blocked) return blocked;
  const ctx = await requireUser();
  if (ctx instanceof Response) return ctx;
  const ok = await deleteSavedRecipe(ctx.db, ctx.userId, (await params).id);
  return ok ? new Response(null, { status: 204 }) : notFound();
}
