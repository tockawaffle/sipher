# Automated QA (`tests/`)

Playwright drives HTTP assertions against the app started by [`playwright.config.ts`](../playwright.config.ts) (`tsx src/server.ts`). Scripts assume `.env.local` provides Postgres, Redis (rate limiting), and federation key env vars.

## Layout

| Folder                         | Purpose                                                                           |
| ------------------------------ | --------------------------------------------------------------------------------- |
| [`federation/`](federation/)   | Discovery, key rotation, and cryptographic helpers exercised via HTTP / pure libs |
| [`proxy/`](proxy/)             | `/proxy` TARGETED + PROXY validation, federation follow ingestion                 |
| [`integration/`](integration/) | **Manual** Bun scripts needing three live federation peers                        |
| [`helpers/`](helpers/)         | DB fixtures, local `/discover` stub                                               |

## Commands

- `npm test` — full Playwright suite under `tests/` (only `**/*.e2e.ts`; see [`playwright.config.ts`](../playwright.config.ts))
- `bun test` — [`bun:test`](https://bun.sh/docs/cli/test) files such as `**/*.test.ts` (for example federation **keytools** unit checks). Do **not** expect Playwright HTTP suites here — they live in `*.e2e.ts` on purpose.
- `npm run test:federation` — `tests/federation/**` (Playwright `*.e2e.ts` plus any Bun tests in that folder)
- `npm run test:proxy` — `tests/proxy/**`
- `npm run test:integration:post` / `test:integration:proxy-chain` — manual federation harnesses

## Prerequisites

- **`BETTER_AUTH_URL`** must match the URL Playwright waits on (`webServer.url` in `playwright.config.ts`, typically `http://localhost:3000`). If the webServer step times out, fix this mismatch first.
- **`NODE_ENV=test`** relaxes **pathname-only** HTTP-server rate limits in [`src/lib/rate-limit/rate-limit-config.ts`](../src/lib/rate-limit/rate-limit-config.ts) so federation suites can issue many POSTs per hour without exhausting budgets.
