import { rejectCrossOrigin } from "@/lib/api-auth";
import { errorJson, modelErrorResponse } from "@/lib/api-errors";
import { detectImageType, MAX_IMAGE_BYTES, recognizeIngredients } from "@/lib/recognize";

// 429 재시도(최대 약 35초 대기)를 감안한 실행 시간 상한
export const maxDuration = 60;

export async function POST(request: Request) {
  // 다른 사이트가 사용자의 브라우저로 이 API를 불러 OpenRouter 크레딧을 쓰지 못하게 한다.
  const blocked = rejectCrossOrigin(request);
  if (blocked) return blocked;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return errorJson(400, "이미지 파일을 multipart/form-data로 보내 주세요.");
  }

  const file = form.get("image");
  if (!(file instanceof File) || file.size === 0) {
    return errorJson(400, "이미지 파일이 없어요.");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return errorJson(400, "이미지는 10MB 이하만 올릴 수 있어요.");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = detectImageType(bytes);
  if (!mime) {
    return errorJson(400, "JPG, PNG, WebP 이미지만 올릴 수 있어요.");
  }

  try {
    const dataUrl = `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
    return Response.json(await recognizeIngredients(dataUrl));
  } catch (e) {
    return modelErrorResponse(e, "recognize", "사진을 분석하지 못했어요. 다른 사진으로 시도해 주세요.");
  }
}
