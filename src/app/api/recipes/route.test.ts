import { beforeEach, describe, expect, it, vi } from "vitest";
import { OpenRouterError } from "@/lib/openrouter";

const generateRecipes = vi.fn();
vi.mock("@/lib/recipe-generator", () => ({
  generateRecipes: (...args: unknown[]) => generateRecipes(...args),
}));

const { POST } = await import("./route");

const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/recipes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

describe("POST /api/recipes", () => {
  beforeEach(() => {
    generateRecipes.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("fills default options and returns recipes", async () => {
    generateRecipes.mockResolvedValue([{ id: "1", title: "계란찜" }]);
    const res = await post({ ingredients: [{ name: "계란" }] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ recipes: [{ id: "1", title: "계란찜" }] });
    expect(generateRecipes.mock.calls[0][0]).toMatchObject({
      options: { maxMinutes: null, servings: 2, assumePantry: true },
      excludeTitles: [],
    });
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

  it("returns an empty list with 200", async () => {
    generateRecipes.mockResolvedValue([]);
    const res = await post({ ingredients: [{ name: "자동차" }] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ recipes: [] });
  });

  it("maps exhausted rate limiting to 503", async () => {
    generateRecipes.mockRejectedValue(new OpenRouterError(429, "rate-limited"));
    const res = await post({ ingredients: [{ name: "계란" }] });
    expect(res.status).toBe(503);
  });
});
