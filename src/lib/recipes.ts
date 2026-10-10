import { z } from "zod";

export const TIME_LIMITS = [15, 30] as const;
export const DIFFICULTIES = ["쉬움", "보통"] as const;
export const CUISINES = ["한식", "양식", "중식", "일식"] as const;
export const SERVINGS = [1, 2, 3, 4] as const;

/** "기본 양념 있음"을 고르면 보유한 것으로 보는 양념 */
export const PANTRY = ["소금", "후추", "간장", "설탕", "식용유", "참기름", "다진 마늘"] as const;

export type Difficulty = (typeof DIFFICULTIES)[number];
export type Cuisine = (typeof CUISINES)[number];

export type RecipeOptions = {
  /** null이면 상관없음 */
  maxMinutes: (typeof TIME_LIMITS)[number] | null;
  difficulty: Difficulty | null;
  servings: number;
  cuisine: Cuisine | null;
  assumePantry: boolean;
};

export const DEFAULT_OPTIONS: RecipeOptions = {
  maxMinutes: null,
  difficulty: null,
  servings: 2,
  cuisine: null,
  assumePantry: true,
};

export type RecipeIngredient = {
  name: string;
  amount: string | null;
  /** 서버가 사용자 재료·기본 양념과 비교해 계산한 값 */
  owned: boolean;
};

export type Recipe = {
  id: string;
  title: string;
  summary: string;
  cuisine: string | null;
  minutes: number | null;
  difficulty: string | null;
  servings: number;
  ingredients: RecipeIngredient[];
  steps: string[];
  tips: string | null;
};

export type RecipesResponse = { recipes: Recipe[] };

export const recipeRequestSchema = z.object({
  ingredients: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(30),
        quantity: z.string().trim().max(30).nullish(),
      }),
    )
    .min(1)
    .max(50),
  options: z
    .object({
      maxMinutes: z.union([z.literal(15), z.literal(30)]).nullable().default(null),
      difficulty: z.enum(DIFFICULTIES).nullable().default(null),
      servings: z.number().int().min(1).max(4).default(2),
      cuisine: z.enum(CUISINES).nullable().default(null),
      assumePantry: z.boolean().default(true),
    })
    .default(DEFAULT_OPTIONS),
  excludeTitles: z.array(z.string().trim().max(60)).max(30).default([]),
});

export type RecipeRequest = z.infer<typeof recipeRequestSchema>;

export const missingCount = (recipe: Recipe) => recipe.ingredients.filter((i) => !i.owned).length;
