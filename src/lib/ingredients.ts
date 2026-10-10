import { z } from "zod";

export const CATEGORIES = [
  "채소",
  "과일",
  "육류",
  "해산물",
  "유제품",
  "단백질",
  "곡물",
  "양념/소스",
  "음료",
  "기타",
] as const;

export const CONFIDENCES = ["high", "medium", "low"] as const;

export type Category = (typeof CATEGORIES)[number];
export type Confidence = (typeof CONFIDENCES)[number];

export type Ingredient = {
  name: string;
  quantity: string | null;
  category: Category;
  confidence: Confidence;
};

export type RecognizeResult = {
  ingredients: Ingredient[];
  notes: string | null;
};

// 모델이 null 대신 "null" 같은 문자열을 넣는 경우가 있어 빈 값으로 본다.
const BLANK_WORDS = new Set(["", "null", "none", "n/a", "없음", "알 수 없음"]);
const optionalText = z
  .string()
  .trim()
  .nullish()
  .catch(null)
  .transform((v) => (v && !BLANK_WORDS.has(v.toLowerCase()) ? v : null));

// 모델 출력은 형식이 조금씩 흔들리므로, 이름이 없는 항목만 버리고 나머지는 기본값으로 보정한다.
const ingredientSchema = z.object({
  name: z.string().trim().min(1),
  quantity: optionalText,
  category: z.enum(CATEGORIES).catch("기타"),
  confidence: z.enum(CONFIDENCES).catch("medium"),
});

export const recognizeResultSchema = z.object({
  ingredients: z
    .array(z.unknown())
    .transform((items) =>
      items.flatMap((item) => {
        const parsed = ingredientSchema.safeParse(item);
        return parsed.success ? [parsed.data] : [];
      }),
    ),
  notes: optionalText,
});

export const SESSION_KEY = "fridge:ingredients";
