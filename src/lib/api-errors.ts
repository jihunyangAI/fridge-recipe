import "server-only";
import { ModelOutputError, NETWORK_ERROR, OpenRouterError } from "./openrouter";

export const errorJson = (status: number, error: string) => Response.json({ error }, { status });

/**
 * 모델 호출 중 난 예외를 사용자용 응답으로 바꾼다.
 * 키·크레딧 문제(401/402 등)의 상세는 서버 로그에만 남긴다. 키 값은 로그에 들어가지 않는다.
 */
export function modelErrorResponse(e: unknown, tag: string, badOutputMessage: string): Response {
  if (e instanceof ModelOutputError) {
    console.error(`[${tag}] bad model output:`, e.message);
    return errorJson(502, badOutputMessage);
  }
  if (e instanceof OpenRouterError && e.status === 429) {
    return errorJson(503, "지금 요청이 많아요. 잠시 후 다시 시도해 주세요.");
  }
  if (e instanceof OpenRouterError && e.status === NETWORK_ERROR) {
    console.error(`[${tag}] network error:`, e.message);
    return errorJson(503, "AI 서버에 연결하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.");
  }
  if (e instanceof OpenRouterError && e.status === 504) {
    console.error(`[${tag}] upstream timeout:`, e.message);
    return errorJson(504, "응답이 너무 오래 걸려요. 잠시 후 다시 시도해 주세요.");
  }
  console.error(`[${tag}] upstream failure:`, e instanceof OpenRouterError ? `${e.status} ${e.message}` : e);
  return errorJson(500, "일시적인 문제가 생겼어요. 잠시 후 다시 시도해 주세요.");
}
