# 냉장고부탁해

냉장고 사진을 올리면 AI가 재료를 찾아 주고, 그 재료로 만들 수 있는 레시피를 추천해 주는 웹 앱입니다.
계정을 만들면 알레르기·식단을 반영한 추천을 받고, 마음에 드는 레시피를 저장해 둘 수 있습니다.

내 PC에서 실행하는 개인용 앱으로 만들었습니다 (데이터는 PC 안의 SQLite 파일에 저장됩니다).

## 주요 기능

| 단계 | 기능 |
|---|---|
| 1. 재료 인식 | 냉장고 사진(JPG/PNG/WebP, 모바일은 바로 촬영)에서 재료와 양을 인식하고, 결과를 고치거나 추가 |
| 2. 레시피 추천 | 조리 시간·난이도·인분·요리 종류를 골라 레시피 3개 생성. 가진 재료/부족한 재료 표시, 단계별 조리법, "다른 레시피 보기" |
| 3. 계정·저장 | 회원가입·로그인, 프로필(알레르기·싫어하는 재료·식단·기본 인분), 레시피 저장과 "내 레시피"(검색·필터·메모·삭제) |

알레르기로 등록한 재료가 들어간 레시피는 AI가 실수로 넣더라도 서버에서 한 번 더 걸러 냅니다.
그래도 정확한 알레르기 성분은 직접 확인해 주세요.

## 준비물

- **Node.js 24 이상** (`node --version`으로 확인)
- **OpenRouter API 키**: [openrouter.ai](https://openrouter.ai)에서 발급. 유료 모델을 쓰므로 크레딧 충전이 필요합니다 ([비용](#비용) 참고).

## 설치와 실행

```bash
# 1. 패키지 설치
npm install

# 2. .env 파일 만들기
#    .env.example을 .env로 복사한 뒤, OPENROUTER_API_KEY= 뒤에 발급받은 키를 붙여 넣습니다.
cp .env.example .env

# 3. 로그인용 비밀값(AUTH_SECRET)과 DB 경로(DATABASE_URL)를 자동으로 채웁니다.
#    이미 값이 있으면 건드리지 않고, 값은 화면에 출력하지 않습니다.
npm run setup:env

# 4. 실행
npm run dev
```

브라우저에서 <http://localhost:3000>을 엽니다.
같은 와이파이의 휴대폰에서는 `npm run dev` 실행 시 표시되는 `Network:` 주소로 접속할 수 있습니다
(처음 접속할 때 Windows 방화벽 허용 창이 뜨면 허용해 주세요).

DB(`data/app.db`)는 첫 요청 때 자동으로 만들어집니다. 따로 설정할 것은 없습니다.

### 환경 변수 (`.env`)

| 이름 | 설명 |
|---|---|
| `OPENROUTER_API_KEY` | OpenRouter API 키. 서버에서만 쓰이며 브라우저로 보내지지 않습니다. |
| `AUTH_SECRET` | 로그인 세션 서명용 비밀값. `npm run setup:env`가 만들어 줍니다. |
| `DATABASE_URL` | SQLite 파일 위치. 기본값 `file:data/app.db` |

`.env`와 `data/`는 `.gitignore`에 들어 있어 git에 올라가지 않습니다. `.env`는 다른 사람과 공유하지 마세요.

## 명령어

| 명령 | 하는 일 |
|---|---|
| `npm run dev` | 개발 서버 실행 (http://localhost:3000) |
| `npm run build` / `npm start` | 프로덕션 빌드 / 빌드한 앱 실행 |
| `npm test` | 자동 테스트 (실제 AI를 부르지 않음) |
| `npm run lint` / `npm run typecheck` | 코드 검사 / 타입 검사 |
| `npm run setup:env` | `.env`에 빠진 `AUTH_SECRET`·`DATABASE_URL` 채우기 |
| `npm run db:generate` | DB 스키마(`src/lib/db/schema.ts`)를 바꾼 뒤 마이그레이션 파일 생성 |
| `node scripts/test-openrouter.mjs` | OpenRouter 연결 테스트 (텍스트·이미지 인식을 실제로 호출) |
| `node scripts/test-openrouter.mjs --key-only` | API 키 사용액과 계정 크레딧만 확인 (AI 호출 없음) |

테스트용 냉장고 사진은 `test-assets/`에 있습니다 (Wikimedia Commons).

## 비용

AI 모델은 OpenRouter의 `google/gemma-4-26b-a4b-it`(유료)를 씁니다.
사진 인식 1번과 레시피 생성 1번을 합쳐 약 **$0.001**(1~2원)이 듭니다.
OpenRouter 설정에서 API 키에 사용 한도를 걸어 두면 예상치 못한 비용을 막을 수 있습니다.

> 같은 모델의 무료 버전(`:free`)은 Google 쪽의 공용 요청 한도에 자주 걸려(429) 쓰지 않습니다.

## 데이터 초기화

서버를 끈 뒤 `data/` 폴더를 지우면 모든 계정과 저장한 레시피가 지워지고, 다음 실행 때 빈 DB가 새로 만들어집니다.
브라우저에 남은 예전 로그인 상태는 "내 레시피"·"프로필"처럼 로그인이 필요한 기능을 쓸 때 자동으로 로그아웃되고 로그인 화면으로 이동합니다.

## 문제 해결

| 증상 | 원인과 해결 |
|---|---|
| "지금 요청이 많아요" | AI 제공자 쪽 요청이 몰린 상태입니다. 잠시 후 다시 시도하세요. |
| "AI 서버에 연결하지 못했어요" | 인터넷 연결을 확인하세요. 일시적인 끊김은 자동으로 다시 시도합니다. |
| "로그인 시도가 너무 많아요" | 같은 이메일로 15분 안에 10번 넘게 시도했습니다. 15분 뒤 다시 시도하거나 서버를 재시작하세요. |
| 레시피가 하나도 안 나옴 | 조건(시간·종류)이나 알레르기 때문에 맞는 레시피가 없을 수 있습니다. 조건을 줄여 보세요. |
| `curl`로 API를 부르면 403 | 다른 사이트의 요청을 막기 위해 같은 출처만 허용합니다. `-H "Origin: http://localhost:3000"`을 붙이세요. |

## 기술 구성

- **Next.js 16** (App Router, TypeScript, Tailwind CSS)
- **OpenRouter** API: 이미지 인식·레시피 생성 (JSON Schema로 응답 형식 강제)
- **SQLite** + Drizzle ORM (`@libsql/client`), **Auth.js v5** (이메일·비밀번호, bcrypt)
- **Vitest**: API·DB·규칙 테스트

기획 문서는 `PRD_step1.md`~`PRD_step3.md`, 코드 구조와 개발 규칙은 `CLAUDE.md`에 정리되어 있습니다.
