# PRD 3단계 — 사용자 프로필과 레시피 저장

## 1. 개요

| 항목 | 내용 |
|---|---|
| 이번 단계 목표 | 사용자가 계정을 만들고, 프로필(식단 선호·알레르기)을 설정하고, 2단계에서 생성된 레시피를 저장·조회·삭제할 수 있게 한다 |
| 사용 모델 | 새 모델 호출 없음. 프로필 정보를 2단계 레시피 생성 프롬프트에 반영한다 (`google/gemma-4-26b-a4b-it`) |
| 선행 조건 | 1·2단계 완료 |

기술 스택과 API 키 원칙은 [PRD_step1.md](PRD_step1.md) 2절과 같다. 이번 단계에서 추가:

- **DB**: SQLite + Drizzle ORM (로컬 파일 DB. 배포 시 Turso/libSQL 또는 Postgres로 바꿀 수 있게 ORM을 거친다)
- **인증**: Auth.js(NextAuth) Credentials 방식(이메일 + 비밀번호), 비밀번호는 bcrypt 해시로 저장
- 추가 환경 변수: `AUTH_SECRET`, `DATABASE_URL` → `.env`에 넣고 `.env.example`에 이름만 추가

## 2. 사용자 시나리오

1. 비로그인 사용자도 1·2단계(인식·레시피 생성)는 그대로 쓸 수 있다.
2. 레시피 상세에서 "저장"을 누르면, 로그인 안 된 경우 로그인/회원가입 화면으로 간다. 가입·로그인 후 원래 레시피로 돌아와 저장이 완료된다.
3. 프로필 화면에서 닉네임, 알레르기, 싫어하는 재료, 식단 유형을 설정한다.
4. 로그인 상태에서 레시피를 생성하면 프로필 정보가 자동으로 반영된다.
5. "내 레시피" 화면에서 저장한 레시피를 목록으로 보고, 열어보고, 메모를 달고, 삭제한다.

## 3. 기능 요구사항

### 3.1 회원가입·로그인

| ID | 요구사항 |
|---|---|
| F3-1 | 이메일 + 비밀번호(8자 이상) 가입. 이메일 중복 시 안내 |
| F3-2 | 로그인·로그아웃. 세션은 Auth.js 기본(JWT 쿠키, httpOnly) |
| F3-3 | 로그인 실패 메시지는 "이메일 또는 비밀번호가 올바르지 않습니다"로 통일 (계정 존재 여부 노출 금지) |
| F3-4 | 로그인 시도는 IP·이메일 기준 15분에 10회로 제한 |

### 3.2 프로필

| 필드 | 타입 | 설명 |
|---|---|---|
| `nickname` | string (2~20자) | 화면 표시 이름 |
| `allergies` | string[] | 예: 땅콩, 갑각류, 우유. 미리 정의한 목록에서 선택 + 직접 입력 |
| `dislikedIngredients` | string[] | 쓰지 않았으면 하는 재료 |
| `dietType` | enum | 일반, 채식(락토오보), 비건, 저탄수화물 |
| `defaultServings` | number (1~4) | 2단계 인분 기본값 |

**레시피 생성 반영 (2단계 확장)**: 로그인 사용자의 `POST /api/recipes` 요청 시 서버가 세션에서 프로필을 읽어 프롬프트에 넣는다.

- 알레르기 재료는 절대 사용 금지로 지시하고, 생성 결과의 재료 목록을 서버에서 다시 검사해 알레르기 재료가 포함된 레시피는 제외한다 (모델 결과를 그대로 믿지 않음).
- 싫어하는 재료는 가능하면 피하도록 지시한다 (서버 필터링은 하지 않음).
- 식단 유형을 지시한다.
- 화면에 "프로필의 알레르기 정보를 반영했어요. 정확한 알레르기 성분은 직접 확인해 주세요." 안내를 표시한다.

### 3.3 레시피 저장

| ID | 요구사항 |
|---|---|
| F3-5 | 레시피 상세의 "저장" 버튼. 저장 후 "저장됨" 상태로 바뀐다 |
| F3-6 | 같은 사용자가 같은 레시피(2단계에서 부여한 `id`)를 두 번 저장하지 않는다 |
| F3-7 | 저장 시 레시피 전체 JSON과, 생성에 쓰인 재료 목록을 함께 저장한다 (원본 사진은 저장하지 않음) |
| F3-8 | 사용자당 저장 최대 200개. 초과 시 안내 |

### 3.4 내 레시피

| ID | 요구사항 |
|---|---|
| F3-9 | 저장 목록: 최신순, 제목 검색, 요리 종류 필터, 20개씩 페이지 |
| F3-10 | 상세 보기: 2단계와 같은 상세 화면 재사용 |
| F3-11 | 메모 작성·수정 (최대 500자). 예: "간장 반만 넣으니 딱 맞음" |
| F3-12 | 삭제 (확인 후) |

## 4. 데이터 모델

```
users
  id            text PK (uuid)
  email         text UNIQUE NOT NULL
  password_hash text NOT NULL
  created_at    integer NOT NULL

profiles
  user_id               text PK FK → users.id (ON DELETE CASCADE)
  nickname              text NOT NULL
  allergies             text NOT NULL DEFAULT '[]'   -- JSON 배열
  disliked_ingredients  text NOT NULL DEFAULT '[]'   -- JSON 배열
  diet_type             text NOT NULL DEFAULT '일반'
  default_servings      integer NOT NULL DEFAULT 2
  updated_at            integer NOT NULL

saved_recipes
  id               text PK (uuid)
  user_id          text FK → users.id (ON DELETE CASCADE)
  recipe_id        text NOT NULL       -- 2단계에서 부여한 id
  title            text NOT NULL       -- 검색용
  cuisine          text
  recipe_json      text NOT NULL       -- 2단계 recipe 객체 전체
  source_ingredients text NOT NULL     -- 생성에 쓰인 재료 목록 JSON
  memo             text
  created_at       integer NOT NULL
  UNIQUE (user_id, recipe_id)
```

## 5. API

모든 API는 로그인 필요(없으면 401). 다른 사용자의 데이터 접근은 404로 응답한다 (존재 여부 노출 금지).

| 메서드·경로 | 설명 |
|---|---|
| `POST /api/auth/register` | 가입 (이메일, 비밀번호, 닉네임) → 프로필 기본값 생성 |
| `/api/auth/*` | Auth.js 로그인·로그아웃·세션 |
| `GET /api/profile` | 내 프로필 조회 |
| `PUT /api/profile` | 내 프로필 수정 (zod 검증) |
| `GET /api/saved-recipes?q=&cuisine=&page=` | 저장 목록 |
| `POST /api/saved-recipes` | 저장 (`recipe`, `sourceIngredients`). 서버에서 zod로 2단계 레시피 형식 재검증. 중복이면 409 |
| `GET /api/saved-recipes/:id` | 상세 |
| `PATCH /api/saved-recipes/:id` | 메모 수정 |
| `DELETE /api/saved-recipes/:id` | 삭제 |

## 6. 비기능 요구사항

- **보안**: 비밀번호 bcrypt(cost 10 이상), 세션 쿠키 httpOnly·SameSite=Lax, 상태 변경 API는 Auth.js CSRF 보호를 따른다. 모든 쿼리는 세션의 `user_id`로 범위를 제한한다.
- **XSS**: 레시피·메모는 모델 또는 사용자 입력이므로 HTML로 렌더링하지 않고 텍스트로만 표시한다.
- **데이터 보관**: SQLite 파일(`data/*.db`)은 `.gitignore`에 추가한다.
- **계정 삭제**: 프로필 화면에서 계정 삭제 시 프로필·저장 레시피를 모두 지운다 (CASCADE).

## 7. 범위 밖

- 소셜 로그인(구글·카카오), 비밀번호 재설정 메일
- 레시피 공유, 공개 프로필, 평점
- 냉장고 재료 재고 관리(장기 보관)
- 여러 기기 간 실시간 동기화

## 8. 완료 기준

- [ ] 가입 → 로그인 → 레시피 생성 → 저장 → 내 레시피에서 확인 → 메모 → 삭제가 끝까지 된다.
- [ ] 비로그인 상태에서 저장을 누르면 로그인 후 원래 레시피로 돌아와 저장된다.
- [ ] 알레르기에 "계란"을 넣은 사용자에게 계란이 들어간 레시피가 표시되지 않는다 (모델이 넣어도 서버에서 제외).
- [ ] 다른 사용자의 저장 레시피 id로 조회·수정·삭제하면 404가 나온다.
- [ ] 같은 레시피를 두 번 저장하면 409와 "이미 저장한 레시피예요" 안내가 나온다.
- [ ] `.env`, DB 파일이 git 추적 대상이 아니다.
