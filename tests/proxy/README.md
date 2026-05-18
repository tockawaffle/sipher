# `/proxy` automated tests

Suite files use **`*.e2e.ts`** (Playwright); run with `npm run test:proxy` or `npm test`, not `bun test`.

## Coverage

- **Transport hygiene**: missing `X-Federation-Origin`, oversized bodies (`413`), invalid JSON (`INVALID_PROXY_DATA`), schema mismatches on PROXY (`INVALID_PROXY_DATA`).
- **PROXY sender bookkeeping**: unknown federation origins (`UNKNOWN_FEDERATION_SERVER_INTERACTION`), signing vs encryption key mismatches vs registry (`INCORRECT_KEYS`).
- **TARGETED decryption**: wrong-recipient ciphertext (`DECRYPT_FAILED` explicit code separate from generic failures removed during audit).
- **Header binding**: decrypted payloads whose `X-Federation-Target` origin disagrees with `targetUrl` are rejected (`INVALID_TARGETED_DATA`).
- **Trust layering**: unknown decrypted sender URLs, blacklisted senders (`BLACKLISTED_FEDERATION_SERVER`), invalid Ed25519 follow signatures (`INVALID_SIGNATURE`).
- **Happy path**: `FEDERATE_FOLLOW` via TARGETED creates a local follow row and returns `PROXY_RESPONSE` encrypted ACK bytes verifiable with the hub federation signing key.
- **Dedup**: repeating identical follower/target identities yields `409 FOLLOW_ALREADY_EXISTS` thanks to DB uniqueness (`follows_follower_following_uidx`).
- **Rate limiting**: per-origin Redis sliding window (`429 RATE_LIMITED`) enforced **before** expensive decryption paths.

## Primary source files

- [`src/app/proxy/route.ts`](../../src/app/proxy/route.ts)
- [`src/lib/zod/methods/FollowSchema.ts`](../../src/lib/zod/methods/FollowSchema.ts)
- [`src/lib/db/schema/index.ts`](../../src/lib/db/schema/index.ts) (`follows`, `server_registry`, `blacklisted_servers`, `user`)
- [`src/lib/federation/keytools.ts`](../../src/lib/federation/keytools.ts)
- [`src/lib/rate-limit/rate-limit.ts`](../../src/lib/rate-limit/rate-limit.ts) (nested `/proxy` limiter keyed per federation URL header)

## Edge cases & limitations

- `/proxy` no longer wraps unexpected failures behind `"Invalid proxied data"` — decrypt failures expose **`DECRYPT_FAILED`**. Unexpected handler/database faults propagate as generic HTTP 500s (surfacing regressions loudly).
- **GLOBAL purge caveat**: `beforeEach` truncates **all** `follows` rows to keep isolation cheap — acceptable only against disposable QA databases.
- Full **`PROXY` relay round-trip** to another live Node still belongs to [`tests/integration/proxy-chain.ts`](../integration/proxy-chain.ts).
