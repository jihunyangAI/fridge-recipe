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
  if (res.status === 401) await dropStaleSession();
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, body?.error ?? "요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.");
  return body as T;
}

/**
 * 서버가 401을 주면 브라우저의 세션도 끝낸다. 계정이 지워졌거나 DB를 초기화해 JWT만 남은 경우,
 * useSession은 계속 "로그인됨"으로 보아 화면이 멈추므로 로그아웃시키고 로그인 화면으로 보낸다.
 */
async function dropStaleSession() {
  if (typeof window === "undefined") return;
  const { signOut } = await import("next-auth/react");
  await signOut({ redirectTo: loginUrl(location.pathname + location.search) });
}

const PROBE_ORIGIN = "http://same-origin.invalid";

/**
 * 로그인 후 돌아갈 주소. 다른 사이트로 보내는 열린 리다이렉트를 막기 위해 우리 사이트 경로만 허용한다.
 * 문자열 앞부분만 보면 "/\t/evil.com"처럼 URL 파서가 탭·줄바꿈을 지워 "//evil.com"이 되는 값을 놓치므로,
 * 제어 문자와 역슬래시를 거부한 뒤 실제로 URL을 풀어 출처가 그대로인지 확인한다.
 */
export function safeCallbackUrl(value: string | null | undefined, fallback = "/"): string {
  if (!value || !value.startsWith("/") || /[\u0000-\u001f\u007f\\]/.test(value)) return fallback;
  try {
    const url = new URL(value, PROBE_ORIGIN);
    if (url.origin !== PROBE_ORIGIN) return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}

export const loginUrl = (callbackUrl: string) => `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`;
