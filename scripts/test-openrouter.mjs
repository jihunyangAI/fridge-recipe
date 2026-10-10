// OpenRouter 텍스트/이미지 인식 연결 테스트
// 실행: node scripts/test-openrouter.mjs [이미지 경로]
//       node scripts/test-openrouter.mjs --key-only   (키 상태만 확인, 모델 요청 없음)
// API 키는 .env에서 읽으며 절대 출력하지 않는다.
import { readFileSync } from "node:fs";
import { extname } from "node:path";

process.loadEnvFile(".env");
const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) {
  console.error("OPENROUTER_API_KEY가 .env에 없습니다.");
  process.exit(1);
}

const TEXT_MODEL = "google/gemma-4-26b-a4b-it";
const VISION_MODEL = "google/gemma-4-26b-a4b-it";
const keyOnly = process.argv.includes("--key-only");
const imagePath = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "test-assets/tomato.jpg";

// 무료 모델은 상위 제공자 쪽 429가 잦으므로 지수 백오프로 재시도
async function chat(model, messages, retries = 4) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await chatOnce(model, messages);
    } catch (e) {
      if (!e.message.startsWith("HTTP 429") || attempt >= retries) throw e;
      const wait = 5000 * 2 ** attempt;
      console.log(`  429 — ${wait / 1000}초 후 재시도 (${attempt + 1}/${retries})`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

async function chatOnce(model, messages) {
  const started = Date.now();
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-Title": "fridge-api-test",
    },
    body: JSON.stringify({ model, messages }),
  });
  const body = await res.json().catch(() => ({}));
  const ms = Date.now() - started;
  if (!res.ok || body.error) {
    const msg = body.error?.message ?? res.statusText;
    const raw = body.error?.metadata?.raw;
    const provider = body.error?.metadata?.provider_name;
    throw new Error(
      `HTTP ${res.status} (${ms}ms): ${msg}` +
        (provider ? `\n제공자: ${provider}` : "") +
        (raw ? `\n상세: ${typeof raw === "string" ? raw : JSON.stringify(raw)}` : ""),
    );
  }
  return {
    ms,
    model: body.model,
    provider: body.provider,
    text: body.choices?.[0]?.message?.content ?? "(빈 응답)",
    usage: body.usage,
  };
}

function report(title, result) {
  console.log(`\n=== ${title} — 성공 ===`);
  console.log(`모델: ${result.model} / 제공자: ${result.provider ?? "-"} / 소요: ${result.ms}ms`);
  if (result.usage) {
    console.log(`토큰: 입력 ${result.usage.prompt_tokens}, 출력 ${result.usage.completion_tokens}`);
  }
  console.log("응답:\n" + result.text);
}

// process.exit()는 fetch 연결이 열린 채로 부르면 Windows에서 libuv assertion으로 죽으므로 exitCode만 정한다.
if (await checkKey()) {
  if (!keyOnly) process.exitCode = (await runModelTests()) ? 1 : 0;
} else {
  process.exitCode = 1;
}

// 키 상태 확인 (키 문자열/라벨은 출력하지 않음)
async function checkKey() {
  const res = await fetch("https://openrouter.ai/api/v1/key", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const { data } = await res.json().catch(() => ({}));
  if (!res.ok || !data) {
    console.error(`키 확인 실패: HTTP ${res.status}`);
    return false;
  }
  console.log(
    `키 유효 — 무료 등급: ${data.is_free_tier}, 사용액: $${data.usage}, 한도: ${data.limit ?? "없음"}` +
      (data.rate_limit ? `, 요청 제한: ${data.rate_limit.requests}/${data.rate_limit.interval}` : ""),
  );
  if (keyOnly) {
    // 키 일부가 담길 수 있는 문자열 필드(label 등)는 빼고, 숫자·불리언 값(사용량·한도)만 보여준다.
    const safe = Object.fromEntries(
      Object.entries(data).filter(([, v]) => typeof v === "number" || typeof v === "boolean" || v === null),
    );
    console.log(JSON.stringify(safe, null, 2));
    await printCredits();
  }
  return true;
}

// 계정 전체 크레딧 (키 한도와 별개)
async function printCredits() {
  const res = await fetch("https://openrouter.ai/api/v1/credits", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const { data } = await res.json().catch(() => ({}));
  if (!res.ok || !data) {
    console.log(`계정 크레딧 확인 실패: HTTP ${res.status}`);
    return;
  }
  const total = Number(data.total_credits);
  const used = Number(data.total_usage);
  console.log(`계정 크레딧 — 충전: $${total}, 사용: $${used.toFixed(6)}, 남음: $${(total - used).toFixed(4)}`);
}

async function runModelTests() {
  let failed = 0;

  try {
    const r = await chat(TEXT_MODEL, [
      { role: "user", content: "냉장고에 계란, 대파, 밥이 있어. 만들 수 있는 요리 하나를 한 문장으로 추천해줘." },
    ]);
    report("텍스트 인식", r);
  } catch (e) {
    failed++;
    console.log(`\n=== 텍스트 인식 — 실패 ===\n${e.message}`);
  }

  try {
    const mime = { ".png": "image/png", ".webp": "image/webp" }[extname(imagePath).toLowerCase()] ?? "image/jpeg";
    const dataUrl = `data:${mime};base64,${readFileSync(imagePath).toString("base64")}`;
    const r = await chat(VISION_MODEL, [
      {
        role: "user",
        content: [
          { type: "text", text: "이 사진에 있는 식재료의 이름과 개수를 한국어로 알려줘." },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
    ]);
    report(`이미지 인식 (${imagePath})`, r);
  } catch (e) {
    failed++;
    console.log(`\n=== 이미지 인식 — 실패 ===\n${e.message}`);
  }

  return failed;
}
