import { beforeEach, describe, expect, it, vi } from "vitest";
import { OpenRouterError } from "@/lib/openrouter";
import { ALLERGY_NOTICE, DIET_NOTICE } from "@/lib/recipes";
import { testAuth, testDb } from "@/test/auth-db";

const generateRecipes = vi.fn();
vi.mock("@/lib/recipe-generator", () => ({
  generateRecipes: (...args: unknown[]) => generateRecipes(...args),
}));
vi.mock("@/auth", () => ({ auth: () => testAuth.session() }));
vi.mock("@/lib/db", async (orig) => ({ ...(await orig<typeof import("@/lib/db")>()), getDb: () => testDb.get() }));

const { POST } = await import("./route");
const { createUser, updateProfile } = await import("@/lib/db/repo");

const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/recipes", {
      method: "POST",
      headers: { "Content-Type": "application/json", origin: "http://localhost", host: "localhost" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

describe("POST /api/recipes", () => {
  beforeEach(() => {
    generateRecipes.mockReset();
    testAuth.signInAs(null);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("fills default options and returns recipes without a profile when logged out", async () => {
    generateRecipes.mockResolvedValue([{ id: "1", title: "계란찜" }]);
    const res = await post({ ingredients: [{ name: "계란" }] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ recipes: [{ id: "1", title: "계란찜" }], profileNotice: null, appliedAllergies: [] });
    expect(generateRecipes.mock.calls[0][0]).toMatchObject({
      options: { maxMinutes: null, servings: 2, assumePantry: true },
      excludeTitles: [],
    });
    expect(generateRecipes.mock.calls[0][2]).toBeNull();
  });

  it("passes the logged-in user's profile and shows the matching notice", async () => {
    const db = await testDb.reset();
    const { id } = await createUser(db, { email: "a@x.com", passwordHash: "h", nickname: "앨리스" });
    testAuth.signInAs(id);
    generateRecipes.mockResolvedValue([]);

    expect((await (await post({ ingredients: [{ name: "계란" }] })).json()).profileNotice).toBeNull();

    await updateProfile(db, id, { nickname: "앨리스", allergies: [], dislikedIngredients: [], dietType: "비건", defaultServings: 2 });
    expect((await (await post({ ingredients: [{ name: "두부" }] })).json()).profileNotice).toBe(DIET_NOTICE);

    await updateProfile(db, id, { nickname: "앨리스", allergies: ["계란"], dislikedIngredients: [], dietType: "일반", defaultServings: 2 });
    const res = await (await post({ ingredients: [{ name: "두부" }] })).json();
    expect(res.profileNotice).toBe(ALLERGY_NOTICE);
    expect(res.appliedAllergies).toEqual(["계란"]);
    expect(generateRecipes.mock.calls.at(-1)?.[2]).toMatchObject({ allergies: ["계란"] });
  });

  it.each([
    ["invalid JSON", "{"],
    ["no ingredients", { ingredients: [] }],
    ["too many ingredients", { ingredients: Array.from({ length: 51 }, (_, i) => ({ name: `재료${i}` })) }],
    ["name too long", { ingredients: [{ name: "가".repeat(31) }] }],
    ["bad option", { ingredients: [{ name: "계란" }], options: { maxMinutes: 45 } }],
  ])("rejects %s with 400", async (_label, body) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(generateRecipes).not.toHaveBeenCalled();
  });

  it("rejects cross-site requests before calling the model", async () => {
    const res = await POST(
      new Request("http://localhost/api/recipes", {
        method: "POST",
        headers: { "Content-Type": "text/plain", origin: "https://evil.example", host: "localhost" },
        body: JSON.stringify({ ingredients: [{ name: "계란" }] }),
      }),
    );
    expect(res.status).toBe(403);
    expect(generateRecipes).not.toHaveBeenCalled();
  });

  it("returns an empty list with 200", async () => {
    generateRecipes.mockResolvedValue([]);
    const res = await post({ ingredients: [{ name: "자동차" }] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ recipes: [], profileNotice: null, appliedAllergies: [] });
  });

  it("maps exhausted rate limiting to 503", async () => {
    generateRecipes.mockRejectedValue(new OpenRouterError(429, "rate-limited"));
    const res = await post({ ingredients: [{ name: "계란" }] });
    expect(res.status).toBe(503);
  });
});
