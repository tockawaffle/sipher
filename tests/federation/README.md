# Federation automated tests

HTTP suites use **`*.e2e.ts`** so `bun test` does not load them as Bun tests. Pure crypto checks live in **`keytools.test.ts`** (`bun:test`; run with `bun test`).

## Coverage

- **Key rotation** (`key-rotation.e2e.ts`): `/discover/rotate/init` and `/discover/rotate/confirm` validation, duplicate pending challenges, per-server URL rate limiting (`429`), blacklist rejection on init, exhausted confirmation attempts (**cancellation**, **no auto-blacklist**), malformed JSON envelopes without decrementing attempts, full rotate-and-clear lifecycle.
- **Keytools** (`keytools.test.ts`): `encryptPayload` / `decryptPayload`, signing primitives, fingerprint hashing — asserts cryptography rejects tampering instead of returning silent garbage.

`/discover` (GET, REGISTER, DISCOVER) coverage has moved to the docker integration suite at [`tests/integration/discover.ts`](../integration/discover.ts) — it runs against the real 3-instance federation cluster (`sipher-c` is the live peer in REGISTER / DISCOVER round-trips) with no stubs. Run with `bun run docker:test:discover`.

## Primary source files

- [`src/app/discover/rotate/init/route.ts`](../../src/app/discover/rotate/init/route.ts)
- [`src/app/discover/rotate/confirm/route.ts`](../../src/app/discover/rotate/confirm/route.ts)
- [`src/lib/federation/keytools.ts`](../../src/lib/federation/keytools.ts)
- [`src/lib/db/schema/index.ts`](../../src/lib/db/schema/index.ts) (`rotate_challenge_tokens`, `blacklisted_servers`)
- [`src/lib/rate-limit/rate-limit-config.ts`](../../src/lib/rate-limit/rate-limit-config.ts)

## Edge cases & limitations

- **Confirmation brute-force policy**: after repeated failures the challenge row is deleted and responses mention cancellation — servers are **not** automatically inserted into `blacklisted_servers` (prevents griefers from rotating-init spam to ban victims).
