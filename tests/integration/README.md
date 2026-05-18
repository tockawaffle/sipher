# Manual federation integration scripts

These are **not** run by Playwright (`npm test`). They are Bun scripts that assume three live Sipher federation instances (A = local `.env.local`, B = proxy, C = target) with Redis, Postgres, workers, and completed mutual discovery.

## Scripts

| Script                                                     | npm shortcut                        |
| ---------------------------------------------------------- | ----------------------------------- |
| [discover.ts](discover.ts)                                 | `npm run docker:test:discover`      |
| [federation-post-delivery.ts](federation-post-delivery.ts) | `npm run docker:test:post-delivery` |
| [proxy-chain.ts](proxy-chain.ts)                           | `npm run docker:test:proxy-chain`   |

### discover.ts

- Exercises **Server A**'s `/discover` endpoint (`GET`, `POST REGISTER`, `POST DISCOVER`) using **Server C** as the live remote peer — no stub layer.
- Covers: peer ordering / healthy filter, input validation, SSRF rejection, unreachable peers, key-mismatch & existing-registration conflicts, encrypted DISCOVER envelopes (decryption + fingerprint match), happy paths for both REGISTER and DISCOVER round-trips.
- Snapshots and restores A's `server_registry` so the mesh is intact for subsequent integration tests.
- **Flags**: `--peer` (default `http://sipher-c:3002`).

### federation-post-delivery.ts

- Exercises **Server A**: `POST /api/auth/social/posts` → BullMQ worker → `federationFetch` (direct or via proxy **B**) → **C**.
- **Requires**: `.env.local` with federation keys, `DATABASE_URL`, `REDIS_URL`, worker running; a Bearer token on **A**; accepted remote follower URLs pointing at **C**.
- **Flags**: `--proxy`, `--target`, `--bearer`, optional `--test-fallback`, `--test-no-remote-followers`.

### proxy-chain.ts

- Exercises **PROXY** and **TARGETED** RPC paths across **A → B → C**, sender-key rejection, unknown sender, and the real failover path `A → C (direct FAILS) → A → B → C` driven by `federationFetch`'s `proxyFallback` against a DNS-blocked target URL.
- **Requires**: three servers up; mutual discovery so **A** appears on **B**’s and **C**’s peer lists; for fallback tests, `--bearer` and `--user`.

## Prerequisites

- `.env.local` populated (`BETTER_AUTH_URL`, federation keys, DB, Redis, etc.).
- `bun` installed (scripts use `bun run`).
- Federation registry populated via discovery between instances before relay/post tests.

## Limitations

- Failures are often environmental (TLS, Docker networking, firewall, stale registry). Use worker logs with `DEBUG=app:federation:*` when jobs hang.
