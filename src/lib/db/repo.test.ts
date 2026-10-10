import { beforeEach, describe, expect, it } from "vitest";
import type { Recipe } from "../recipes";
import { openDb, type Db } from "./index";
import {
  createUser,
  deleteSavedRecipe,
  deleteUser,
  DuplicateError,
  findSavedByRecipeIds,
  findUserByEmail,
  getProfile,
  getSavedRecipe,
  LimitError,
  listSavedRecipes,
  MAX_SAVED,
  saveRecipe,
  updateMemo,
  updateProfile,
} from "./repo";

const recipe = (id: string, title = `레시피 ${id}`, cuisine: string | null = "한식"): Recipe => ({
  id,
  title,
  summary: "요약",
  cuisine,
  minutes: 15,
  difficulty: "쉬움",
  servings: 2,
  ingredients: [{ name: "계란", amount: "2개", owned: true }],
  steps: ["계란을 완전히 익힌다."],
  tips: null,
});

let db: Db;
let alice: string;
let bob: string;

beforeEach(async () => {
  db = await openDb(":memory:");
  alice = (await createUser(db, { email: "Alice@Example.com", passwordHash: "h1", nickname: "앨리스" })).id;
  bob = (await createUser(db, { email: "bob@example.com", passwordHash: "h2", nickname: "밥" })).id;
});

describe("users and profiles", () => {
  it("normalizes email and rejects duplicates case-insensitively", async () => {
    expect((await findUserByEmail(db, " alice@example.COM "))?.id).toBe(alice);
    await expect(createUser(db, { email: "ALICE@example.com", passwordHash: "x", nickname: "가짜" })).rejects.toBeInstanceOf(
      DuplicateError,
    );
  });

  it("creates a default profile and updates it", async () => {
    expect(await getProfile(db, alice)).toEqual({
      nickname: "앨리스",
      allergies: [],
      dislikedIngredients: [],
      dietType: "일반",
      defaultServings: 2,
    });
    const next = { nickname: "앨리", allergies: ["계란"], dislikedIngredients: ["오이"], dietType: "비건" as const, defaultServings: 3 };
    await updateProfile(db, alice, next);
    expect(await getProfile(db, alice)).toEqual(next);
    expect((await getProfile(db, bob))?.allergies).toEqual([]);
  });

  it("deleting a user cascades to profile and saved recipes", async () => {
    await saveRecipe(db, alice, recipe("r1"), []);
    await deleteUser(db, alice);
    expect(await getProfile(db, alice)).toBeNull();
    expect((await listSavedRecipes(db, alice, {})).total).toBe(0);
    expect(await getProfile(db, bob)).not.toBeNull();
  });
});

describe("saved recipes", () => {
  it("saves with source ingredients and returns the full detail", async () => {
    const { id } = await saveRecipe(db, alice, recipe("r1", "계란찜"), [{ name: "계란", quantity: "6개" }]);
    const saved = await getSavedRecipe(db, alice, id);
    expect(saved).toMatchObject({ id, recipeId: "r1", title: "계란찜", memo: null, minutes: 15 });
    expect(saved?.recipe.steps).toEqual(["계란을 완전히 익힌다."]);
    expect(saved?.sourceIngredients).toEqual([{ name: "계란", quantity: "6개" }]);
  });

  it("rejects saving the same recipe twice for one user, but not across users", async () => {
    await saveRecipe(db, alice, recipe("r1"), []);
    await expect(saveRecipe(db, alice, recipe("r1"), [])).rejects.toBeInstanceOf(DuplicateError);
    await expect(saveRecipe(db, bob, recipe("r1"), [])).resolves.toHaveProperty("id");
  });

  it(`stops at ${MAX_SAVED} recipes per user`, async () => {
    for (let i = 0; i < MAX_SAVED; i++) await saveRecipe(db, alice, recipe(`r${i}`), []);
    await expect(saveRecipe(db, alice, recipe("one-more"), [])).rejects.toBeInstanceOf(LimitError);
    await expect(saveRecipe(db, bob, recipe("one-more"), [])).resolves.toHaveProperty("id");
  });

  it("never exceeds the limit when saves arrive at the same time", async () => {
    for (let i = 0; i < MAX_SAVED - 2; i++) await saveRecipe(db, alice, recipe(`r${i}`), []);
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, (_, i) => saveRecipe(db, alice, recipe(`race${i}`), [])),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(rejected.every((r) => r.reason instanceof LimitError)).toBe(true);
    expect((await listSavedRecipes(db, alice, {})).total).toBe(MAX_SAVED);
  });

  it("lists newest first with title search, cuisine filter and 20 per page", async () => {
    for (let i = 0; i < 25; i++) await saveRecipe(db, alice, recipe(`r${i}`, `요리 ${i}`, i % 2 ? "양식" : "한식"), []);
    await saveRecipe(db, alice, recipe("x", "100% 계란말이"), []);
    await saveRecipe(db, bob, recipe("b", "밥의 요리"), []);

    const page1 = await listSavedRecipes(db, alice, {});
    expect(page1.total).toBe(26);
    expect(page1.items).toHaveLength(20);
    expect(page1.items[0].title).toBe("100% 계란말이");
    expect((await listSavedRecipes(db, alice, { page: 2 })).items).toHaveLength(6);

    expect((await listSavedRecipes(db, alice, { q: "계란" })).items.map((i) => i.title)).toEqual(["100% 계란말이"]);
    // %와 _는 와일드카드가 아니라 글자 그대로 찾는다.
    expect((await listSavedRecipes(db, alice, { q: "100%" })).total).toBe(1);
    expect((await listSavedRecipes(db, alice, { q: "%" })).total).toBe(1);
    expect((await listSavedRecipes(db, alice, { q: "_" })).total).toBe(0);

    expect((await listSavedRecipes(db, alice, { cuisine: "양식" })).total).toBe(12);
    expect((await listSavedRecipes(db, alice, { q: "밥" })).total).toBe(0);
  });

  it("scopes get, memo and delete to the owner", async () => {
    const { id } = await saveRecipe(db, alice, recipe("r1"), []);
    expect(await getSavedRecipe(db, bob, id)).toBeNull();
    expect(await updateMemo(db, bob, id, "해킹")).toBe(false);
    expect(await deleteSavedRecipe(db, bob, id)).toBe(false);

    expect(await updateMemo(db, alice, id, "간장 반만")).toBe(true);
    expect((await getSavedRecipe(db, alice, id))?.memo).toBe("간장 반만");
    expect(await deleteSavedRecipe(db, alice, id)).toBe(true);
    expect(await getSavedRecipe(db, alice, id)).toBeNull();
  });

  it("looks up which generated recipes are already saved", async () => {
    const { id } = await saveRecipe(db, alice, recipe("r1"), []);
    await saveRecipe(db, bob, recipe("r2"), []);
    expect(await findSavedByRecipeIds(db, alice, ["r1", "r2", "r3"])).toEqual({ r1: id });
    expect(await findSavedByRecipeIds(db, alice, [])).toEqual({});
  });
});
