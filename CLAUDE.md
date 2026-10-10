# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # dev server (http://localhost:3000)
npm run build        # production build
npm test             # vitest, all tests
npx vitest run src/lib/recognize.test.ts      # one file
npx vitest run -t "retries 429"               # tests matching a name
npm run lint         # eslint
npm run typecheck    # tsc --noEmit (run `npx next typegen` first if LayoutProps/PageProps are missing)
node scripts/test-openrouter.mjs [image]      # live OpenRouter smoke test (needs Node 24+)
node scripts/test-openrouter.mjs --key-only   # key usage/limits only, no model request
```

Next.js is 16.x (with `cacheComponents` enabled), which is newer than most training data. See `AGENTS.md`, and check `node_modules/next/dist/docs/` before using Next APIs.

## Product plan

The app recognizes ingredients in a fridge photo and recommends recipes. It is built in three stages, each with its own spec: `PRD_step1.md` (image → ingredient recognition, **implemented**), `PRD_step2.md` (ingredients → recipe generation, **implemented**), and `PRD_step3.md` (accounts, profiles, saved recipes; planned SQLite + Drizzle + Auth.js). Read the relevant PRD before implementing a stage.

## Architecture

- `src/lib/openrouter.ts` (server-only): the single OpenRouter client, used by every model call.
  - `chatCompletion()` retries 429 with backoff (5→10→20s), but only within a shared deadline (`DEFAULT_BUDGET_MS` = 50s), so the server answers before the client's 60s timeout. It returns the raw text, which may be empty.
  - `requestJson(model, messages, spec, deps)` takes a `spec` (`JsonSpec`: `name`, `schema`, `parse`). It sends `response_format: json_schema` (strict) with `provider.require_parameters: true`, so only providers that enforce the schema are used. Without this, Gemma sometimes produced broken JSON like `{"name":"브로콜리","송이"}`. It then extracts the JSON, validates it with `parse`, and re-requests once on failure. If both fail it throws `ModelOutputError`. Unusable output and non-`stop` finish reasons are logged with `console.warn`. When the output shape changes, update both the JSON Schema and the zod schema.
  - `withDeadline()` lets several calls share one budget.
- `src/lib/api-errors.ts`: `modelErrorResponse()` maps errors to statuses for every route. Exhausted 429 → 503, timeout → 504, `ModelOutputError` → 502, key or credit problems → generic 500 (details only in the server log).
- Step 1: `recognize.ts` holds the vision prompt and `detectImageType()`, which checks magic bytes (the client MIME type is never trusted). `ingredients.ts` holds the types and a deliberately lenient zod schema: it drops nameless items, defaults unknown enum values, and treats `"null"` strings as null. The free Gemma model often breaks the format.
- Step 2: `recipe-generator.ts` builds the prompt, with all user text inside `<data>` and an instruction to ignore directives there.
  - Server rules apply on top of the model: `owned` is always recomputed (name containment for names of 2+ characters, 달걀→계란, pantry when `assumePantry`, water always counts). A recipe is dropped if it has more than 2 missing ingredients, uses none of the user's ingredients, breaks `maxMinutes` (unknown time also counts as breaking it), or repeats an `excludeTitles` entry (spaces ignored).
  - If nothing survives the rules, it regenerates once. If that also fails, the result is `[]`, which is not an error. The client shows "조건에 맞는 레시피를 찾지 못했어요".
  - `recipes.ts` holds the shared types and the request schema.
- Client state lives in sessionStorage through `session-store.ts` (`createSessionStore`, `useSyncExternalStore`). Use it rather than `setState` inside effects, which the React lint rule rejects. `useHydrated()` gates logic that depends on the browser, such as redirecting from `/recipes` to `/` when there are no ingredients. `fridge:ingredients` holds the step 1 list. `fridge:recipes` (`recipe-store.ts`) holds the results, the options, and `seenTitles` for "다른 레시피 보기". It is discarded when the ingredient list changes (`ingredientsKey`).
- With `cacheComponents`, Next keeps the previously visited route's `<main>` hidden in the DOM. Browser tests must target visible elements.
- Tests use dependency injection (`ChatDeps`: `fetchImpl`, `sleep`, `now`, `deadlineAt`), so they never hit the network. `vitest.config.mts` aliases `server-only` to an empty module.

## OpenRouter

- Both text and vision use the paid `google/gemma-4-26b-a4b-it` ($0.09/M input, $0.3/M output, roughly $0.001 per recognize + recipe flow). The key has a $10 spending limit.
- The `:free` variant was dropped because of persistent 429 `temporarily rate-limited upstream` errors from Google AI Studio. That limit is shared across all free users, and paying for credits does not lift it. The 429 retry logic stays as a safety net.
- HTTP header values must be ASCII. A Korean `X-Title` made `fetch` throw before sending.

## Secrets

- `.env` holds `OPENROUTER_API_KEY`. Don't read it or print its value. It is gitignored, and `.claude/settings.json` denies Claude from reading it. Next.js loads it automatically.
- `.env.example` lists the variable names. When you add a new variable, add its name there too.
- Access the key only in `server-only` modules. Never use `NEXT_PUBLIC_*` for it. After building, `grep -rE "openrouter\.ai|OPENROUTER_API_KEY" .next/static` must find nothing.
