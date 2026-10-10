import { beforeEach, describe, expect, it, vi } from "vitest";
import { jsonRequest, testAuth, testDb } from "@/test/auth-db";

vi.mock("@/auth", () => ({ auth: () => testAuth.session() }));
vi.mock("@/lib/db", async (orig) => ({ ...(await orig<typeof import("@/lib/db")>()), getDb: () => testDb.get() }));

const { POST } = await import("./route");
const { registerLimiter } = await import("@/lib/rate-limit");
const { findUserByEmail } = await import("@/lib/db/repo");

let n = 0;
const register = (overrides: Record<string, unknown> = {}, headers: Record<string, string> = {}) => {
  const req = jsonRequest("/api/auth/register", "POST", {
    email: `user${n++}@example.com`,
    password: "password123",
    nickname: "앨리스",
    ...overrides,
  });
  for (const [k, v] of Object.entries(headers)) req.headers.set(k, v);
  return POST(req);
};

describe("POST /api/auth/register", () => {
  beforeEach(async () => {
    await testDb.reset();
    registerLimiter.clear();
  });

  it("creates an account", async () => {
    const res = await register({ email: "a@example.com" });
    expect(res.status).toBe(201);
    expect(await findUserByEmail(await testDb.get(), "a@example.com")).not.toBeNull();
  });

  it("counts the password in bytes, not characters (bcrypt only reads 72 bytes)", async () => {
    // 한글은 글자당 3바이트: 24자 = 72바이트는 허용, 25자 = 75바이트는 거절
    expect((await register({ password: "가".repeat(24) })).status).toBe(201);
    const res = await register({ password: "가".repeat(25) });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("72바이트");
  });

  it("accepts 72 ASCII characters and rejects 73 or fewer than 8", async () => {
    expect((await register({ password: "a".repeat(72) })).status).toBe(201);
    expect((await register({ password: "a".repeat(73) })).status).toBe(400);
    expect((await register({ password: "a".repeat(7) })).status).toBe(400);
  });

  it("rejects duplicates with 409 and cross-origin requests with 403", async () => {
    await register({ email: "dup@example.com" });
    expect((await register({ email: "DUP@example.com" })).status).toBe(409);
    const evil = jsonRequest("/api/auth/register", "POST", {}, "https://evil.example");
    expect((await POST(evil)).status).toBe(403);
  });

  it("limits registrations per IP to 5 per minute with 429", async () => {
    const ip = { "x-forwarded-for": "203.0.113.7" };
    for (let i = 0; i < 5; i++) expect((await register({}, ip)).status).toBe(201);
    const res = await register({}, ip);
    expect(res.status).toBe(429);
    expect((await res.json()).error).toContain("요청이 너무 많아요");
    // 다른 IP는 영향 없음
    expect((await register({}, { "x-forwarded-for": "203.0.113.8" })).status).toBe(201);
  });
});
