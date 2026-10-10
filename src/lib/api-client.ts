export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** 우리 API를 JSON으로 호출한다. 실패하면 서버가 준 error 문구를 담은 ApiError를 던진다. */
export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const res = await fetch(path, {
    ...rest,
    headers: { ...(json !== undefined && { "Content-Type": "application/json" }), ...headers },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, body?.error ?? "요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.");
  return body as T;
}

/** 로그인 후 돌아갈 주소. 다른 사이트로 보내는 열린 리다이렉트를 막기 위해 우리 사이트 경로만 허용한다. */
export function safeCallbackUrl(value: string | null | undefined, fallback = "/"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  return value;
}

export const loginUrl = (callbackUrl: string) => `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`;
