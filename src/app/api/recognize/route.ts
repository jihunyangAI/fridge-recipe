import { optionalUser, rejectCrossOrigin } from "@/lib/api-auth";
import { errorJson, modelErrorResponse } from "@/lib/api-errors";
import { aiLimiter, clientIp, TOO_MANY_REQUESTS } from "@/lib/rate-limit";
import { detectImageType, MAX_IMAGE_BYTES, recognizeIngredients } from "@/lib/recognize";

// 429 재시도(최대 약 35초 대기)를 감안한 실행 시간 상한
export const maxDuration = 60;

const MULTIPART_OVERHEAD_BYTES = 1024 * 1024;

export async function POST(request: Request) {
  // 다른 사이트가 사용자의 브라우저로 이 API를 불러 OpenRouter 크레딧을 쓰지 못하게 한다.
  const blocked = rejectCrossOrigin(request);
  if (blocked) return blocked;

  // 유료 모델 호출이라 사용자(비로그인이면 IP)별로 분당 횟수를 제한한다.
  const user = await optionalUser();
  const limiterKey = `recognize:${user ? `user:${user.userId}` : `ip:${clientIp(request) ?? "anon"}`}`;
  if (aiLimiter.isLimited(limiterKey)) return errorJson(429, TOO_MANY_REQUESTS);
  aiLimiter.hit(limiterKey);

  // formData()는 본문 전체를 메모리로 읽으므로, 너무 큰 요청은 읽기 전에 거절한다 (멀티파트 오버헤드 여유 1MB).
  const declaredLength = Number(request.headers.get("content-length"));
  if (declaredLength > MAX_IMAGE_BYTES + MULTIPART_OVERHEAD_BYTES) {
    return errorJson(413, "이미지는 10MB 이하만 올릴 수 있어요.");
  }

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
