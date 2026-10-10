import { beforeEach, describe, expect, it, vi } from "vitest";
import { OpenRouterError } from "@/lib/openrouter";

// api-auth가 @/auth(next-auth)를 불러오므로 테스트에서는 대신한다. 이 라우트는 로그인을 쓰지 않는다.
vi.mock("@/auth", () => ({ auth: async () => null }));

const recognizeIngredients = vi.fn();
vi.mock("@/lib/recognize", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/recognize")>()),
  recognizeIngredients: (...args: unknown[]) => recognizeIngredients(...args),
}));

const { POST } = await import("./route");
const { ModelOutputError } = await import("@/lib/openrouter");

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

function post(file?: Blob, name = "fridge.jpg", origin: string | null = "http://localhost") {
  const form = new FormData();
  if (file) form.append("image", file, name);
  return POST(
    new Request("http://localhost/api/recognize", {
      method: "POST",
      body: form,
      headers: { origin: origin ?? "", host: "localhost" },
    }),
  );
}

describe("POST /api/recognize", () => {
  beforeEach(() => {
    recognizeIngredients.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("returns recognized ingredients for a JPEG", async () => {
    const result = { ingredients: [{ name: "계란", quantity: null, category: "단백질", confidence: "high" }], notes: null };
    recognizeIngredients.mockResolvedValue(result);
    const res = await post(new Blob([JPEG], { type: "image/jpeg" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(result);
    expect(recognizeIngredients.mock.calls[0][0]).toMatch(/^data:image\/jpeg;base64,/);
  });

  it("rejects cross-site uploads before calling the model", async () => {
    const res = await post(new Blob([JPEG], { type: "image/jpeg" }), "fridge.jpg", "https://evil.example");
    expect(res.status).toBe(403);
    expect(recognizeIngredients).not.toHaveBeenCalled();
  });

  it("rejects a missing file with 400", async () => {
    const res = await post();
    expect(res.status).toBe(400);
  });

  it("rejects a non-image disguised as JPEG with 400", async () => {
    const res = await post(new Blob(["GIF89a......"], { type: "image/jpeg" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("JPG, PNG, WebP");
    expect(recognizeIngredients).not.toHaveBeenCalled();
  });

  it("rejects files over 10MB with 400", async () => {
    const big = new Uint8Array(10 * 1024 * 1024 + 1);
    big.set(JPEG);
    const res = await post(new Blob([big], { type: "image/jpeg" }));
    expect(res.status).toBe(400);
  });

  it("maps exhausted 429 retries to 503", async () => {
    recognizeIngredients.mockRejectedValue(new OpenRouterError(429, "rate-limited upstream"));
    const res = await post(new Blob([JPEG]));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("지금 요청이 많아요. 잠시 후 다시 시도해 주세요.");
  });

  it("maps a lost connection to 503 with a connection message", async () => {
    recognizeIngredients.mockRejectedValue(new OpenRouterError(0, "fetch failed"));
    const res = await post(new Blob([JPEG]));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toContain("인터넷 연결");
  });

  it("maps an upstream timeout to 504", async () => {
    recognizeIngredients.mockRejectedValue(new OpenRouterError(504, "timeout"));
    const res = await post(new Blob([JPEG]));
    expect(res.status).toBe(504);
  });

  it("maps a parse failure to 502", async () => {
    recognizeIngredients.mockRejectedValue(new ModelOutputError("bad"));
    const res = await post(new Blob([JPEG]));
    expect(res.status).toBe(502);
  });

  it("hides auth/credit errors behind a generic 500", async () => {
    recognizeIngredients.mockRejectedValue(new OpenRouterError(402, "Insufficient credits"));
    const res = await post(new Blob([JPEG]));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("credits");
  });
});
