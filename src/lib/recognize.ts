import "server-only";
import { CATEGORIES, CONFIDENCES, recognizeResultSchema, type RecognizeResult } from "./ingredients";
import { MODEL, requestJson, type ChatDeps, type JsonSpec } from "./openrouter";

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const SYSTEM_PROMPT = `너는 냉장고 사진에서 식재료를 찾아내는 도우미다.
규칙:
- 사진에 실제로 보이는 식재료만 적는다. 보이지 않는 재료를 추측해서 지어내지 않는다.
- 재료명은 한국어 일반 명칭으로 적는다. 품종이나 세부 종류는 확실할 때만 적는다.
- 포장된 제품은 라벨이 읽히면 그 내용으로, 읽히지 않으면 "알 수 없는 소스병"처럼 적는다.
- 용기, 냉장고 선반, 비닐봉지 등 식재료가 아닌 물건은 제외한다.
- quantity는 "3개", "반 통", "1팩"처럼 대략적인 양을 적고, 판단할 수 없으면 null로 둔다.
- category는 다음 중 하나: ${CATEGORIES.join(", ")}
- confidence는 high, medium, low 중 하나다.
- notes에는 가려짐·흐림 등 인식의 한계를 한 문장으로 적고, 없으면 null로 둔다.

반드시 아래 형식의 JSON 객체 하나만 출력한다. 설명 문장이나 코드 블록 표시를 붙이지 않는다.
{"ingredients":[{"name":"계란","quantity":"6개","category":"단백질","confidence":"high"}],"notes":null}`;

/**
 * 이미지 data URL에서 식재료 목록을 인식한다.
 * 응답 JSON 파싱·검증에 실패하면 1회 다시 요청한다 (실패 시 ModelOutputError).
 */
export async function recognizeIngredients(
  imageDataUrl: string,
  deps?: ChatDeps,
): Promise<RecognizeResult> {
  const messages = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    {
      role: "user" as const,
      content: [
        { type: "text" as const, text: "이 냉장고 사진에 있는 식재료를 JSON으로 알려줘." },
        { type: "image_url" as const, image_url: { url: imageDataUrl } },
      ],
    },
  ];
  return requestJson(MODEL, messages, RECOGNIZE_FORMAT, deps);
}

const RECOGNIZE_FORMAT: JsonSpec<RecognizeResult> = {
  name: "fridge_ingredients",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["ingredients", "notes"],
    properties: {
      ingredients: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "quantity", "category", "confidence"],
          properties: {
            name: { type: "string" },
            quantity: { type: ["string", "null"] },
            category: { type: "string", enum: [...CATEGORIES] },
            confidence: { type: "string", enum: [...CONFIDENCES] },
          },
        },
      },
      notes: { type: ["string", "null"] },
    },
  },
  parse: (value) => recognizeResultSchema.parse(value),
};

/** 파일 앞부분의 시그니처로 실제 이미지 형식을 판별한다 (클라이언트가 보낸 MIME은 믿지 않는다). */
export function detectImageType(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  const at = (i: number) => bytes[i];
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return "image/jpeg";
  if (at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47) return "image/png";
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}
