import "server-only";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

// 이미지 인식과 레시피 생성 모두 같은 모델을 쓴다. :free 버전은 Google 쪽 공통 429가 잦아 유료 버전을 쓴다.
export const MODEL = "google/gemma-4-26b-a4b-it";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content:
    | string
    | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;
};

/** 응답을 강제할 JSON Schema. 지원하는 제공자로만 라우팅된다 (provider.require_parameters). */
export type JsonFormat = { name: string; schema: Record<string, unknown> };

export class OpenRouterError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "OpenRouterError";
  }
}

export type ChatDeps = {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** 429 재시도 전 대기 시간 목록. 길이가 곧 최대 재시도 횟수다. */
  retryDelaysMs?: number[];
  attemptTimeoutMs?: number;
  /** 재시도를 포함한 전체 마감 시각(epoch ms). 클라이언트 타임아웃(60초)보다 먼저 응답하기 위해 쓴다. */
  deadlineAt?: number;
  now?: () => number;
};

export const DEFAULT_BUDGET_MS = 50_000;
// 남은 시간이 이보다 적으면 새 요청을 시작하지 않는다.
const MIN_ATTEMPT_MS = 3_000;

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * OpenRouter chat/completions 호출. 상위 제공자의 429에 대비해
 * 마감 시각 안에서 지수 백오프로 재시도한다. 응답 본문의 텍스트를 반환한다 (빈 문자열일 수 있음).
 */
export async function chatCompletion(
  model: string,
  messages: ChatMessage[],
  format?: JsonFormat,
  {
    fetchImpl = fetch,
    sleep = defaultSleep,
    retryDelaysMs = [5000, 10000, 20000],
    attemptTimeoutMs = 25000,
    now = Date.now,
    deadlineAt = now() + DEFAULT_BUDGET_MS,
  }: ChatDeps = {},
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new OpenRouterError(500, "OPENROUTER_API_KEY is not set");

  const remaining = () => deadlineAt - now();
  if (remaining() < MIN_ATTEMPT_MS) throw new OpenRouterError(504, "No time left for request");

  for (let attempt = 0; ; attempt++) {
    try {
      const timeout = Math.min(attemptTimeoutMs, remaining());
      return await chatOnce(fetchImpl, apiKey, buildBody(model, messages, format), timeout);
    } catch (e) {
      const retryable = e instanceof OpenRouterError && e.status === 429;
      const delay = retryDelaysMs[attempt];
      if (!retryable || delay === undefined || remaining() - delay < MIN_ATTEMPT_MS) throw e;
      await sleep(delay);
    }
  }
}

function buildBody(model: string, messages: ChatMessage[], format?: JsonFormat) {
  if (!format) return { model, messages };
  return {
    model,
    messages,
    // 모델이 키가 빠진 객체 같은 깨진 JSON을 내는 일이 있어 스키마로 출력 형식을 강제한다.
    response_format: {
      type: "json_schema",
      json_schema: { name: format.name, strict: true, schema: format.schema },
    },
    provider: { require_parameters: true },
  };
}

async function chatOnce(
  fetchImpl: typeof fetch,
  apiKey: string,
  body: ReturnType<typeof buildBody>,
  timeoutMs: number,
): Promise<string> {
  let res: Response;
  try {
    res = await fetchImpl(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        // 헤더 값은 ASCII만 허용된다 (한글을 넣으면 fetch가 요청 전에 실패한다).
        "X-Title": "fridge-recipe",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    throw new OpenRouterError(504, `OpenRouter request failed: ${(e as Error).message}`);
  }

  const data = await res.json().catch(() => null);
  // OpenRouter는 200 응답 안에 error를 담아 보내기도 한다.
  const error = data?.error;
  if (!res.ok || error) {
    const status = typeof error?.code === "number" ? error.code : res.status;
    const raw = error?.metadata?.raw;
    const detail = typeof raw === "string" ? raw : (error?.message ?? res.statusText);
    throw new OpenRouterError(status === 200 ? 502 : status, detail);
  }

  // 빈 응답은 호출한 쪽의 JSON 파싱 단계에서 실패로 처리되어 한 번 더 요청된다.
  const choice = data?.choices?.[0];
  if (choice?.finish_reason && choice.finish_reason !== "stop") {
    console.warn(`[openrouter] ${body.model} finished with "${choice.finish_reason}"`);
  }
  const content = choice?.message?.content;
  return typeof content === "string" ? content : "";
}

/** 모델 응답을 두 번 받아도 기대한 JSON 형식이 아닐 때 던진다. */
export class ModelOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelOutputError";
  }
}

/** deps에 마감 시각이 없으면 지금부터 DEFAULT_BUDGET_MS 뒤로 정한다. 여러 호출이 같은 예산을 나눠 쓸 때 쓴다. */
export function withDeadline(deps: ChatDeps = {}): ChatDeps {
  const now = deps.now ?? Date.now;
  return { ...deps, deadlineAt: deps.deadlineAt ?? now() + DEFAULT_BUDGET_MS };
}

export type JsonSpec<T> = JsonFormat & {
  /** 스키마를 강제해도 값이 비거나 어긋날 수 있으므로 한 번 더 검증·보정한다. */
  parse: (value: unknown) => T;
};

/**
 * 모델에 JSON Schema로 형식을 강제해 응답을 요청하고 spec.parse로 검증한다.
 * 응답이 JSON이 아니거나 검증에 실패하면 같은 마감 시각 안에서 1회 다시 요청한다.
 */
export async function requestJson<T>(
  model: string,
  messages: ChatMessage[],
  { parse, ...format }: JsonSpec<T>,
  deps?: ChatDeps,
): Promise<T> {
  const shared = withDeadline(deps);
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    let text: string;
    try {
      text = await chatCompletion(model, messages, format, shared);
    } catch (e) {
      // 첫 응답이 잘못된 뒤 재요청할 시간이 없으면 형식 오류로 보고한다.
      if (attempt > 0 && e instanceof OpenRouterError && e.status === 504) break;
      throw e;
    }
    try {
      return parse(extractJson(text));
    } catch (e) {
      lastError = e;
      // 원인 파악용: 응답 앞부분만 남긴다 (모델 출력이라 비밀값은 없다).
      console.warn(
        `[openrouter] unusable output (attempt ${attempt + 1}, ${text.length} chars): ${JSON.stringify(text.slice(0, 300))}`,
      );
    }
  }
  throw new ModelOutputError(`Model response was not valid JSON: ${String(lastError)}`);
}

/** 모델 응답 문자열에서 JSON 객체를 꺼낸다. 코드 블록 감싸기나 앞뒤 설명 문장을 허용한다. */
export function extractJson(text: string): unknown {
  const unfenced = text.replace(/```(?:json)?/gi, "");
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start === -1 || end <= start) throw new SyntaxError("No JSON object in model response");
  return JSON.parse(unfenced.slice(start, end + 1));
}
