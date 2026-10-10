import "server-only";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import type { DietType, Profile } from "../profile";
import type { Recipe, SourceIngredient } from "../recipes";
import type { Db } from "./index";
import { profiles, savedRecipes, users } from "./schema";

// 모든 함수는 userId로 범위를 제한한다. 다른 사용자의 행은 "없는 것"과 똑같이 다룬다.

export class DuplicateError extends Error {}
export class LimitError extends Error {}

export const MAX_SAVED = 200;
export const PAGE_SIZE = 20;

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

function isUniqueViolation(e: unknown): boolean {
  for (let cur: unknown = e; cur; cur = (cur as { cause?: unknown }).cause) {
    if (cur instanceof Error && /UNIQUE constraint failed/i.test(cur.message)) return true;
  }
  return false;
}

// ---- users / profiles

export async function createUser(
  db: Db,
  input: { email: string; passwordHash: string; nickname: string },
): Promise<{ id: string }> {
  const id = crypto.randomUUID();
  const now = Date.now();
  try {
    await db.transaction(async (tx) => {
      await tx.insert(users).values({ id, email: normalizeEmail(input.email), passwordHash: input.passwordHash, createdAt: now });
      await tx.insert(profiles).values({ userId: id, nickname: input.nickname, updatedAt: now });
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new DuplicateError("email already registered");
    throw e;
  }
  return { id };
}

export async function findUserByEmail(db: Db, email: string) {
  const [row] = await db.select().from(users).where(eq(users.email, normalizeEmail(email))).limit(1);
  return row ?? null;
}

export async function userExists(db: Db, userId: string): Promise<boolean> {
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
  return !!row;
}

export async function deleteUser(db: Db, userId: string): Promise<void> {
  // profiles, saved_recipes는 ON DELETE CASCADE로 함께 지워진다.
  await db.delete(users).where(eq(users.id, userId));
}

export async function getProfile(db: Db, userId: string): Promise<Profile | null> {
  const [row] = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  if (!row) return null;
  return {
    nickname: row.nickname,
    allergies: row.allergies,
    dislikedIngredients: row.dislikedIngredients,
    dietType: row.dietType as DietType,
    defaultServings: row.defaultServings,
  };
}

export async function updateProfile(db: Db, userId: string, input: Profile): Promise<void> {
  await db
    .update(profiles)
    .set({ ...input, updatedAt: Date.now() })
    .where(eq(profiles.userId, userId));
}

// ---- saved recipes

export type SavedRecipeSummary = {
  id: string;
  recipeId: string;
  title: string;
  cuisine: string | null;
  summary: string;
  minutes: number | null;
  difficulty: string | null;
  memo: string | null;
  createdAt: number;
};

export type SavedRecipeDetail = SavedRecipeSummary & {
  recipe: Recipe;
  sourceIngredients: SourceIngredient[];
};

export async function saveRecipe(
  db: Db,
  userId: string,
  recipe: Recipe,
  sourceIngredients: SourceIngredient[],
): Promise<{ id: string }> {
  const id = crypto.randomUUID();
  try {
    // 개수 확인과 삽입을 한 문장으로 처리한다. 따로 하면 동시에 들어온 요청들이 모두 확인을 통과해 한도를 넘길 수 있다.
    const result = await db.run(sql`
      INSERT INTO saved_recipes (id, user_id, recipe_id, title, cuisine, recipe_json, source_ingredients, created_at)
      SELECT ${id}, ${userId}, ${recipe.id}, ${recipe.title}, ${recipe.cuisine}, ${JSON.stringify(recipe)},
             ${JSON.stringify(sourceIngredients)}, ${Date.now()}
      WHERE (SELECT count(*) FROM saved_recipes WHERE user_id = ${userId}) < ${MAX_SAVED}`);
    if (result.rowsAffected === 0) throw new LimitError(`max ${MAX_SAVED} saved recipes`);
  } catch (e) {
    if (isUniqueViolation(e)) throw new DuplicateError("recipe already saved");
    throw e;
  }
  return { id };
}

type SavedRow = typeof savedRecipes.$inferSelect;

function toSummary(row: SavedRow): SavedRecipeSummary {
  const recipe = JSON.parse(row.recipeJson) as Recipe;
  return {
    id: row.id,
    recipeId: row.recipeId,
    title: row.title,
    cuisine: row.cuisine,
    summary: recipe.summary,
    minutes: recipe.minutes,
    difficulty: recipe.difficulty,
    memo: row.memo,
    createdAt: row.createdAt,
  };
}

/** LIKE 패턴에서 %, _, \ 를 글자 그대로 찾도록 이스케이프한다. */
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function listSavedRecipes(
  db: Db,
  userId: string,
  { q, cuisine, page = 1 }: { q?: string; cuisine?: string; page?: number },
): Promise<{ items: SavedRecipeSummary[]; total: number; page: number; pageSize: number }> {
  const conditions = [eq(savedRecipes.userId, userId)];
  if (q?.trim()) {
    const pattern = `%${escapeLike(q.trim())}%`;
    conditions.push(sql`${savedRecipes.title} LIKE ${pattern} ESCAPE '\\'`);
  }
  if (cuisine) conditions.push(eq(savedRecipes.cuisine, cuisine));
  const where = and(...conditions);

  const [{ total }] = await db.select({ total: count() }).from(savedRecipes).where(where);
  const rows = await db
    .select()
    .from(savedRecipes)
    .where(where)
    // 같은 밀리초에 저장된 행은 created_at이 같다. id(UUID)는 무작위라 삽입 순서(rowid)로 최신순을 정한다.
    .orderBy(desc(savedRecipes.createdAt), desc(sql`rowid`))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);
  return { items: rows.map(toSummary), total, page, pageSize: PAGE_SIZE };
}

export async function getSavedRecipe(db: Db, userId: string, id: string): Promise<SavedRecipeDetail | null> {
  const [row] = await db
    .select()
    .from(savedRecipes)
    .where(and(eq(savedRecipes.id, id), eq(savedRecipes.userId, userId)))
    .limit(1);
  if (!row) return null;
  return {
    ...toSummary(row),
    recipe: JSON.parse(row.recipeJson),
    sourceIngredients: JSON.parse(row.sourceIngredients),
  };
}

/** 메모를 바꾼다. 내 레시피가 아니면 false. */
export async function updateMemo(db: Db, userId: string, id: string, memo: string | null): Promise<boolean> {
  const result = await db
    .update(savedRecipes)
    .set({ memo })
    .where(and(eq(savedRecipes.id, id), eq(savedRecipes.userId, userId)));
  return result.rowsAffected > 0;
}

/** 저장 레시피를 지운다. 내 레시피가 아니면 false. */
export async function deleteSavedRecipe(db: Db, userId: string, id: string): Promise<boolean> {
  const result = await db.delete(savedRecipes).where(and(eq(savedRecipes.id, id), eq(savedRecipes.userId, userId)));
  return result.rowsAffected > 0;
}

/** 2단계 레시피 id 중 이미 저장한 것을 { recipeId: savedId }로 돌려준다 ("저장됨" 표시용). */
export async function findSavedByRecipeIds(
  db: Db,
  userId: string,
  recipeIds: string[],
): Promise<Record<string, string>> {
  if (recipeIds.length === 0) return {};
  const rows = await db
    .select({ id: savedRecipes.id, recipeId: savedRecipes.recipeId })
    .from(savedRecipes)
    .where(and(eq(savedRecipes.userId, userId), inArray(savedRecipes.recipeId, recipeIds)));
  return Object.fromEntries(rows.map((r) => [r.recipeId, r.id]));
}
