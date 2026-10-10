import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chatCompletion, extractJson, OpenRouterError } from "./openrouter";

const ok = (content: string) =>
  new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
const rateLimited = () =>
  new Response(
    JSON.stringify({
      error: { code: 429, message: "Provider returned error", metadata: { raw: "temporarily rate-limited upstream" } },
    }),
    { status: 429 },
  );

const noSleep = (ms: number) => Promise.resolve(void ms);

describe("chatCompletion", () => {
  beforeEach(() => vi.stubEnv("OPENROUTER_API_KEY", "test-key"));
  afterEach(() => vi.unstubAllEnvs());

  it("returns the message content", async () => {
    const fetchImpl = vi.fn(async () => ok("hello"));
    await expect(chatCompletion("m", [], undefined, { fetchImpl, sleep: noSleep })).resolves.toBe("hello");
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
  });

  it("sends headers that real fetch accepts", () => {
    // 모킹된 fetch는 헤더를 검증하지 않으므로, 실제 Headers 생성자로 확인한다.
    let captured: HeadersInit | undefined;
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      captured = init?.headers;
      return ok("x");
    });
    return chatCompletion("m", [], undefined, { fetchImpl, sleep: noSleep }).then(() => {
      expect(() => new Headers(captured)).not.toThrow();
    });
  });

  it("retries 429 with the configured backoff and then succeeds", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(rateLimited())
      .mockResolvedValueOnce(rateLimited())
      .mockResolvedValueOnce(ok("done"));
    const sleep = vi.fn(noSleep);
    await expect(chatCompletion("m", [], undefined, { fetchImpl, sleep })).resolves.toBe("done");
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([5000, 10000]);
  });

  it("gives up after 3 retries on persistent 429", async () => {
    const fetchImpl = vi.fn(async () => rateLimited());
    const err = await chatCompletion("m", [], undefined, { fetchImpl, sleep: noSleep }).catch((e) => e);
    expect(err).toBeInstanceOf(OpenRouterError);
    expect(err.status).toBe(429);
    expect(err.message).toContain("rate-limited upstream");
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("stops retrying when the next wait would pass the deadline", async () => {
    let clock = 0;
    const fetchImpl = vi.fn(async () => rateLimited());
    const sleep = vi.fn(async (ms: number) => {
      clock += ms;
    });
    // 예산 16초: 5초 대기 후 재시도는 되지만, 그다음 10초 대기는 3초 여유를 남기지 못한다.
    const err = await chatCompletion("m", [], undefined, { fetchImpl, sleep, now: () => clock, deadlineAt: 16_000 }).catch(
      (e) => e,
    );
    expect(err.status).toBe(429);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([5000]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("fails with 504 without calling fetch when the budget is already spent", async () => {
    const fetchImpl = vi.fn(async () => ok("x"));
    const err = await chatCompletion("m", [], undefined, { fetchImpl, now: () => 0, deadlineAt: 2_000 }).catch((e) => e);
    expect(err.status).toBe(504);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns an empty string for an empty model message", async () => {
    const fetchImpl = vi.fn(async () => ok(""));
    await expect(chatCompletion("m", [], undefined, { fetchImpl })).resolves.toBe("");
  });

  it("retries a dropped connection but not a timeout", async () => {
    const flaky = vi.fn().mockRejectedValueOnce(new TypeError("fetch failed")).mockResolvedValueOnce(ok("back"));
    await expect(chatCompletion("m", [], undefined, { fetchImpl: flaky, sleep: noSleep })).resolves.toBe("back");

    const slow = vi.fn().mockRejectedValue(new DOMException("timed out", "TimeoutError"));
    const err = await chatCompletion("m", [], undefined, { fetchImpl: slow, sleep: noSleep }).catch((e) => e);
    expect(err.status).toBe(504);
    expect(slow).toHaveBeenCalledTimes(1);
  });

  it.each([502, 503])("retries a transient %i from the provider within the budget", async (status) => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: status, message: "unavailable" } }), { status }))
      .mockResolvedValueOnce(ok("recovered"));
    const sleep = vi.fn(noSleep);
    await expect(chatCompletion("m", [], undefined, { fetchImpl, sleep })).resolves.toBe("recovered");
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([5000]);
  });

  it("does not retry a 503 when the wait would pass the deadline", async () => {
    let clock = 0;
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 503 }));
    const sleep = vi.fn(async (ms: number) => {
      clock += ms;
    });
    const err = await chatCompletion("m", [], undefined, { fetchImpl, sleep, now: () => clock, deadlineAt: 6_000 }).catch(
      (e) => e,
    );
    expect(err.status).toBe(503);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("reports a timeout while reading the response body as 504, not as an empty answer", async () => {
    const timedOutBody = {
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => {
        throw new DOMException("timed out", "TimeoutError");
      },
    } as unknown as Response;
    const fetchImpl = vi.fn(async () => timedOutBody);
    const err = await chatCompletion("m", [], undefined, { fetchImpl, sleep: noSleep }).catch((e) => e);
    expect(err).toBeInstanceOf(OpenRouterError);
    expect(err.status).toBe(504);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("does not retry non-429 errors", async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ error: { code: 401, message: "No auth" } }), { status: 401 }),
    );
    const err = await chatCompletion("m", [], undefined, { fetchImpl, sleep: noSleep }).catch((e) => e);
    expect(err.status).toBe(401);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("treats an error object inside a 200 response as a failure", async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ error: { code: 429, message: "x" } }), { status: 200 }),
    );
    const err = await chatCompletion("m", [], undefined, { fetchImpl, sleep: noSleep, retryDelaysMs: [] }).catch((e) => e);
    expect(err.status).toBe(429);
  });

  it("fails without an API key and never calls fetch", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    const fetchImpl = vi.fn();
    await expect(chatCompletion("m", [], undefined, { fetchImpl })).rejects.toThrow("OPENROUTER_API_KEY");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("extractJson", () => {
  it("parses plain JSON", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it("strips code fences and surrounding prose", () => {
    expect(extractJson('결과입니다:\n```json\n{"a":[1,2]}\n```\n끝')).toEqual({ a: [1, 2] });
  });

  it("throws when there is no object", () => {
    expect(() => extractJson("재료가 없어요")).toThrow(SyntaxError);
  });
});
