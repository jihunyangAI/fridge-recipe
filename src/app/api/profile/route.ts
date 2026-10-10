import { rejectCrossOrigin, requireUser } from "@/lib/api-auth";
import { errorJson } from "@/lib/api-errors";
import { deleteUser, getProfile, updateProfile } from "@/lib/db/repo";
import { profileInputSchema } from "@/lib/profile";

export async function GET() {
  const ctx = await requireUser();
  if (ctx instanceof Response) return ctx;
  const profile = await getProfile(ctx.db, ctx.userId);
  if (!profile) return errorJson(404, "프로필을 찾을 수 없어요.");
  return Response.json(profile);
}

export async function PUT(request: Request) {
  const blocked = rejectCrossOrigin(request);
  if (blocked) return blocked;
  const ctx = await requireUser();
  if (ctx instanceof Response) return ctx;

  const parsed = profileInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return errorJson(400, "닉네임은 2~20자, 재료 이름은 20자 이하로 입력해 주세요.");
  }
  await updateProfile(ctx.db, ctx.userId, parsed.data);
  return Response.json(parsed.data);
}

/** 계정 삭제. 프로필과 저장한 레시피도 모두 지워진다. */
export async function DELETE(request: Request) {
  const blocked = rejectCrossOrigin(request);
  if (blocked) return blocked;
  const ctx = await requireUser();
  if (ctx instanceof Response) return ctx;
  await deleteUser(ctx.db, ctx.userId);
  return new Response(null, { status: 204 });
}
