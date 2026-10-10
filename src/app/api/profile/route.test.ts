import { beforeEach, describe, expect, it, vi } from "vitest";
import { jsonRequest, testAuth, testDb } from "@/test/auth-db";

vi.mock("@/auth", () => ({ auth: () => testAuth.session() }));
vi.mock("@/lib/db", async (orig) => ({ ...(await orig<typeof import("@/lib/db")>()), getDb: () => testDb.get() }));

const profileRoute = await import("./route");
const register = await import("../auth/register/route");
const { registerLimiter } = await import("@/lib/rate-limit");
const { createUser, findUserByEmail, saveRecipe, listSavedRecipes } = await import("@/lib/db/repo");

describe("POST /api/auth/register", () => {
  beforeEach(async () => {
    await testDb.reset();
    registerLimiter.clear();
  });

  it("creates a user with a bcrypt hash and a default profile", async () => {
    const res = await register.POST(
      jsonRequest("/api/auth/register", "POST", { email: "New@X.com", password: "password1", nickname: "새사람" }),
    );
    expect(res.status).toBe(201);
    const user = await findUserByEmail(await testDb.get(), "new@x.com");
    expect(user?.passwordHash).toMatch(/^\$2[aby]\$10\$/);
    expect(user?.passwordHash).not.toContain("password1");
  });

  it("answers 409 for a duplicate email", async () => {
    const body = { email: "dup@x.com", password: "password1", nickname: "중복" };
    await register.POST(jsonRequest("/api/auth/register", "POST", body));
    const res = await register.POST(jsonRequest("/api/auth/register", "POST", { ...body, email: "DUP@x.com" }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("이미 가입된 이메일이에요.");
  });

  it.each([
    ["short password", { password: "1234567" }, "비밀번호"],
    ["bad email", { email: "not-an-email" }, "이메일"],
    ["short nickname", { nickname: "a" }, "닉네임"],
  ])("rejects %s", async (_label, patch, word) => {
    const body = { email: "ok@x.com", password: "password1", nickname: "괜찮음", ...patch };
    const res = await register.POST(jsonRequest("/api/auth/register", "POST", body));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain(word);
  });
});

describe("/api/profile", () => {
  let userId: string;
  beforeEach(async () => {
    const db = await testDb.reset();
    userId = (await createUser(db, { email: "p@x.com", passwordHash: "h", nickname: "프로필" })).id;
    testAuth.signInAs(userId);
  });

  const valid = { nickname: "바뀐이름", allergies: ["계란"], dislikedIngredients: ["오이"], dietType: "채식(락토오보)", defaultServings: 3 };

  it("reads and updates my profile", async () => {
    expect(await (await profileRoute.GET()).json()).toMatchObject({ nickname: "프로필", defaultServings: 2 });
    const put = await profileRoute.PUT(jsonRequest("/api/profile", "PUT", valid));
    expect(put.status).toBe(200);
    expect(await (await profileRoute.GET()).json()).toEqual(valid);
  });

  it("rejects invalid input and requires login", async () => {
    expect((await profileRoute.PUT(jsonRequest("/api/profile", "PUT", { ...valid, dietType: "육식" }))).status).toBe(400);
    testAuth.signInAs(null);
    expect((await profileRoute.GET()).status).toBe(401);
  });

  it("deletes the account together with saved recipes", async () => {
    const db = await testDb.get();
    await saveRecipe(
      db,
      userId,
      { id: "r", title: "t", summary: "", cuisine: null, minutes: null, difficulty: null, servings: 2, ingredients: [{ name: "a", amount: null, owned: true }], steps: ["s"], tips: null },
      [],
    );
    expect((await profileRoute.DELETE(jsonRequest("/api/profile", "DELETE"))).status).toBe(204);
    expect(await findUserByEmail(db, "p@x.com")).toBeNull();
    expect((await listSavedRecipes(db, userId, {})).total).toBe(0);
    // 남은 세션 토큰으로는 더 이상 접근할 수 없다.
    expect((await profileRoute.GET()).status).toBe(401);
  });
});
