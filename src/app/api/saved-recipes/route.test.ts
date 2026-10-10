import { beforeEach, describe, expect, it, vi } from "vitest";
import { jsonRequest, routeParams, testAuth, testDb } from "@/test/auth-db";

vi.mock("@/auth", () => ({ auth: () => testAuth.session() }));
vi.mock("@/lib/db", async (orig) => ({ ...(await orig<typeof import("@/lib/db")>()), getDb: () => testDb.get() }));

const list = await import("./route");
const item = await import("./[id]/route");
const lookup = await import("./lookup/route");
const { createUser } = await import("@/lib/db/repo");

const recipe = {
  id: "gen-1",
  title: "대파 계란 볶음밥",
  summary: "고소한 볶음밥",
  cuisine: "한식",
  minutes: 15,
  difficulty: "쉬움",
  servings: 2,
  ingredients: [{ name: "계란", amount: "2개", owned: true }],
  steps: ["계란을 완전히 익힌다."],
  tips: null,
};
const sourceIngredients = [{ name: "계란", quantity: "6개" }];

let alice: string;
let bob: string;

beforeEach(async () => {
  const db = await testDb.reset();
  alice = (await createUser(db, { email: "a@x.com", passwordHash: "h", nickname: "앨리스" })).id;
  bob = (await createUser(db, { email: "b@x.com", passwordHash: "h", nickname: "밥" })).id;
  testAuth.signInAs(alice);
});

const save = (body: unknown = { recipe, sourceIngredients }) => list.POST(jsonRequest("/api/saved-recipes", "POST", body));

describe("saved recipes API", () => {
  it("requires login", async () => {
    testAuth.signInAs(null);
    expect((await save()).status).toBe(401);
    expect((await list.GET(jsonRequest("/api/saved-recipes", "GET"))).status).toBe(401);
  });

  it("treats a session for a deleted account as logged out", async () => {
    testAuth.signInAs("no-such-user");
    expect((await save()).status).toBe(401);
  });

  it("rejects cross-site requests", async () => {
    const res = await list.POST(jsonRequest("/api/saved-recipes", "POST", { recipe, sourceIngredients }, "https://evil.example"));
    expect(res.status).toBe(403);
    const noOrigin = await list.POST(jsonRequest("/api/saved-recipes", "POST", { recipe, sourceIngredients }, null));
    expect(noOrigin.status).toBe(403);
  });

  it("saves once and answers 409 with a message on the second save", async () => {
    const first = await save();
    expect(first.status).toBe(201);
    const second = await save();
    expect(second.status).toBe(409);
    expect((await second.json()).error).toBe("이미 저장한 레시피예요.");
  });

  it("re-validates the recipe shape on the server", async () => {
    expect((await save({ recipe: { ...recipe, steps: [] }, sourceIngredients })).status).toBe(400);
    expect((await save({ recipe: { ...recipe, title: "<script>".repeat(20) }, sourceIngredients })).status).toBe(400);
  });

  it("lists, reads, updates memo and deletes my recipe", async () => {
    const { id } = await (await save()).json();

    const listed = await (await list.GET(jsonRequest("/api/saved-recipes?q=볶음&page=1", "GET"))).json();
    expect(listed).toMatchObject({ total: 1, page: 1, pageSize: 20 });
    expect(listed.items[0]).toMatchObject({ id, title: "대파 계란 볶음밥" });

    const detail = await (await item.GET(jsonRequest(`/api/saved-recipes/${id}`, "GET"), routeParams({ id }))).json();
    expect(detail.recipe.title).toBe("대파 계란 볶음밥");
    expect(detail.sourceIngredients).toEqual(sourceIngredients);

    const memo = await item.PATCH(jsonRequest(`/api/saved-recipes/${id}`, "PATCH", { memo: "  간장 반만  " }), routeParams({ id }));
    expect(await memo.json()).toEqual({ memo: "간장 반만" });
    const tooLong = await item.PATCH(jsonRequest(`/api/saved-recipes/${id}`, "PATCH", { memo: "가".repeat(501) }), routeParams({ id }));
    expect(tooLong.status).toBe(400);

    const lookedUp = await (await lookup.GET(jsonRequest("/api/saved-recipes/lookup?recipeIds=gen-1,gen-2", "GET"))).json();
    expect(lookedUp).toEqual({ saved: { "gen-1": id } });

    expect((await item.DELETE(jsonRequest(`/api/saved-recipes/${id}`, "DELETE"), routeParams({ id }))).status).toBe(204);
    expect((await item.GET(jsonRequest(`/api/saved-recipes/${id}`, "GET"), routeParams({ id }))).status).toBe(404);
  });

  it("answers 404 for another user's recipe on read, update and delete", async () => {
    const { id } = await (await save()).json();
    testAuth.signInAs(bob);
    expect((await item.GET(jsonRequest(`/api/saved-recipes/${id}`, "GET"), routeParams({ id }))).status).toBe(404);
    expect(
      (await item.PATCH(jsonRequest(`/api/saved-recipes/${id}`, "PATCH", { memo: "x" }), routeParams({ id }))).status,
    ).toBe(404);
    expect((await item.DELETE(jsonRequest(`/api/saved-recipes/${id}`, "DELETE"), routeParams({ id }))).status).toBe(404);
    expect((await (await list.GET(jsonRequest("/api/saved-recipes", "GET"))).json()).total).toBe(0);

    // 지워지지 않았는지 주인으로 확인
    testAuth.signInAs(alice);
    expect((await item.GET(jsonRequest(`/api/saved-recipes/${id}`, "GET"), routeParams({ id }))).status).toBe(200);
  });
});
