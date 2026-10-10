import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ModelOutputError } from "./openrouter";
import { detectImageType, recognizeIngredients } from "./recognize";

const reply = (content: string) =>
  new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });

describe("recognizeIngredients", () => {
  beforeEach(() => vi.stubEnv("OPENROUTER_API_KEY", "test-key"));
  afterEach(() => vi.unstubAllEnvs());

  it("normalizes the model output", async () => {
    const content = JSON.stringify({
      ingredients: [
        { name: " 계란 ", quantity: "6개", category: "단백질", confidence: "high" },
        { name: "대파", quantity: "", category: "알수없음", confidence: "??" },
        { name: "치즈", quantity: "null", category: "유제품", confidence: "medium" },
        { name: "", quantity: "1개", category: "채소", confidence: "low" },
      ],
      notes: "null",
    });
    const fetchImpl = vi.fn(async () => reply(content));
    const result = await recognizeIngredients("data:image/jpeg;base64,AAAA", { fetchImpl });
    expect(result).toEqual({
      ingredients: [
        { name: "계란", quantity: "6개", category: "단백질", confidence: "high" },
        { name: "대파", quantity: null, category: "기타", confidence: "medium" },
        { name: "치즈", quantity: null, category: "유제품", confidence: "medium" },
      ],
      notes: null,
    });
  });

  it("sends the image as an image_url part", async () => {
    const fetchImpl = vi.fn(async () => reply('{"ingredients":[],"notes":null}'));
    await recognizeIngredients("data:image/jpeg;base64,AAAA", { fetchImpl });
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.messages[1].content[1]).toEqual({
      type: "image_url",
      image_url: { url: "data:image/jpeg;base64,AAAA" },
    });
    expect(body.response_format.json_schema.name).toBe("fridge_ingredients");
    expect(body.provider).toEqual({ require_parameters: true });
  });

  it("re-requests once when the first answer is not JSON", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(reply("죄송하지만 잘 모르겠어요"))
      .mockResolvedValueOnce(reply('```json\n{"ingredients":[{"name":"우유","category":"유제품","confidence":"high"}]}\n```'));
    const result = await recognizeIngredients("data:image/jpeg;base64,AAAA", { fetchImpl });
    expect(result.ingredients).toEqual([
      { name: "우유", quantity: null, category: "유제품", confidence: "high" },
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("re-requests once when the model returns an empty message", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(reply(""))
      .mockResolvedValueOnce(reply('{"ingredients":[],"notes":null}'));
    await expect(recognizeIngredients("data:image/jpeg;base64,AAAA", { fetchImpl })).resolves.toEqual({
      ingredients: [],
      notes: null,
    });
  });

  it("reports a parse failure when no time is left for the re-request", async () => {
    let clock = 0;
    const fetchImpl = vi.fn(async () => {
      clock += 48_000; // 첫 요청이 예산을 거의 다 쓴다
      return reply("not json");
    });
    await expect(
      recognizeIngredients("data:image/jpeg;base64,AAAA", { fetchImpl, now: () => clock }),
    ).rejects.toBeInstanceOf(ModelOutputError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("fails with ModelOutputError after two bad answers", async () => {
    const fetchImpl = vi.fn(async () => reply('{"foo":1}'));
    await expect(recognizeIngredients("data:image/jpeg;base64,AAAA", { fetchImpl })).rejects.toBeInstanceOf(
      ModelOutputError,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe("detectImageType", () => {
  const bytes = (...b: number[]) => new Uint8Array([...b, ...new Array(12).fill(0)]);
  const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

  it("detects JPEG, PNG and WebP by signature", () => {
    expect(detectImageType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(detectImageType(bytes(0x89, 0x50, 0x4e, 0x47))).toBe("image/png");
    expect(detectImageType(bytes(...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WEBP")))).toBe("image/webp");
  });

  it("rejects other content", () => {
    expect(detectImageType(bytes(...ascii("GIF89a")))).toBeNull();
    expect(detectImageType(new TextEncoder().encode("<svg></svg>"))).toBeNull();
  });
});
