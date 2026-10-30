# SiPher

> *Silent Whisper — A federated social network built for the modern age.*

[![License](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](./LICENSE)
![Version](https://img.shields.io/badge/version-0.2.0-purple.svg)
![Status](https://img.shields.io/badge/status-early%20development-orange.svg)

SiPher is a federated social network. Each server is independent, no central authority, no single point of failure.

Your identity is `you@<base58_id>`. Your data, your rules.

Every user controls their own Ed25519 keypair generated from a BIP-39 mnemonic. The secret key never leaves the browser. Posts, follows, and every social action are signed client-side and verified server-side.

---

## Architecture

SiPher is an **API-only** server: a single Bun process running [Elysia](https://elysiajs.com) that serves the Better Auth endpoints, the federation API and a WebSocket channel. There is no bundled UI; clients talk to the API directly, and the browser-side identity/signing code lives in `src/sdk` (the seed of a future `@sipher/sdk` package).


| Layer          | Technology                                                                            |
| -------------- | ------------------------------------------------------------------------------------- |
| Framework      | Elysia on Bun (`src/app.ts`), OpenAPI docs at `/openapi` (incl. Better Auth routes)   |
| Authentication | [Better Auth](https://better-auth.com) — email/password, username, 2FA, bearer tokens |
| Database       | PostgreSQL via [Drizzle ORM](https://orm.drizzle.team)                                |
| Cache / Queues | Redis — session storage, rate limiting, BullMQ background jobs                        |
| Object Storage | MinIO (S3-compatible) — media uploads with presigned URLs                             |
| Client Storage | IndexedDB (Dexie) — encrypted identity keypairs                                       |
| Real-time      | Bun native WebSocket pub/sub at `/ws` — firehose topic for live updates               |


### Custom Better Auth Plugins

SiPher extends Better Auth with three custom plugins, each registering its own database schema and API endpoints:

- **sipher-federation** — Server registry, key rotation challenges, blacklist management.
- **sipher-social** — Posts, follows, blocks, mutes as Better Auth API endpoints.
- **sipher-oven** — E2EE identity registration (Ed25519 keys, OLM device key bundles).

### API Routes


| Route                            | Purpose                                            |
| -------------------------------- | -------------------------------------------------- |
| `GET /discover`                  | Return this server's public keys and healthy peers |
| `POST /discover`                 | Discover or register a remote server               |
| `POST /discover/rotate/init`     | Initiate key rotation (4 challenges)               |
| `POST /discover/rotate/confirm`  | Submit key rotation proofs                         |
| `POST /proxy`                    | Relay federation traffic through a proxy peer      |
| `POST /api/auth/social/posts`    | Create or receive a federated post                 |
| `GET /api/auth/social/posts/:id` | Get a post                                         |
| `POST /api/auth/social/follows`  | Follow, respond, or federate a follow              |
| `POST /api/auth/social/blocks`   | Block a user (auto-cleanses follows both ways)     |
| `POST /api/auth/social/mutes`    | Mute a user                                        |
| `POST /oven/identity/register`   | Register a user's public identity key              |
| `POST /oven/keys/upload`         | Upload OLM device key bundle                       |
| `GET /oven/identity/check`       | Check identity registration status                 |


---

## Identity & E2EE

### User Identity (the "Oven")

Every SiPher user has a cryptographic identity generated entirely in the browser:

1. A **BIP-39 mnemonic** (12 words, 128-bit entropy) is generated.
2. An **Ed25519 keypair** is derived from the mnemonic seed via HKDF-SHA256.
3. The keypair is **encrypted with AES-256-GCM** and stored in IndexedDB via Dexie. The encryption key is derived from the user's master password (PBKDF2, 600k iterations).
4. The public key (base58) and a fingerprint are uploaded to the server.
5. **OLM device keys** are generated and all public keys are uploaded to the server for Matrix-protocol-based E2EE messaging.

### Session Key Store

Once unlocked, the Ed25519 keypair is held in module-level memory and `sessionStorage`. The sessionStorage layer means the key survives hard page reloads within the same tab but is cleared when the tab closes. It is intentionally NOT stored in `localStorage`.

The session key store exposes a simple `sign(message)` function that uses the cached secret key. For one-shot operations where you don't want to cache the key across the session, the Oven plugin provides `useSigningKey` — a callback API that decrypts the key, hands the caller a sign closure, and zeroes the in-memory secret immediately after the callback resolves. The secret never escapes that scope.

### Unlock Flow

1. On page load, `UnlockIdentityModal` tries `restoreSessionKey()` from sessionStorage.
2. If that fails, the user is prompted for their master password.
3. On correct password, `unlockSessionKey()` decrypts the Dexie blob, caches the keypair, and notifies listeners via a pub/sub pattern.
4. On logout, `clearSessionKey()` zeroes the in-memory secret and clears sessionStorage.

---

## Federation

### Discovery & Registration

Every server exposes its public keys via `GET /discover`. A server can register a peer by sending a `REGISTER` request to the peer's `/discover` endpoint. The registration flow:

1. Validates the URL is safe (SSRF guard — see Security section).
2. Fetches the remote `/discover` to confirm the claimed keys match.
3. Upserts into the `serverRegistry` table.
4. Returns an echo of the registering server's own keys.

The `DISCOVER` method lets a server look up another server by signing public key and confirm that the stored keys still match the live peer.

### Proxy Relay

When two servers cannot reach each other directly (censorship, NAT, firewall), traffic can be routed through a mutual peer:

- **PROXY method** — Server A sends an encrypted payload + target URL + its public keys to proxy peer B. B verifies both A and C are registered, forwards to C as a `TARGETED` request, and returns the encrypted response.
- **TARGETED method** — Server C decrypts the inner payload, validates signatures, processes the action (follow, post), and returns an encrypted acknowledgment.

The proxy **never sees plaintext content**. It only knows "Server A is talking to Server B."

A threat model (`threat-model.ts`) classifies network errors and determines whether proxy fallback is eligible:


| Error            | Proxy-Eligible |
| ---------------- | -------------- |
| DNS_BLOCKED      | Yes            |
| TIMEOUT          | Yes            |
| CONN_REFUSED     | Yes            |
| CONN_RESET       | Yes            |
| TLS_ERROR        | No             |
| INVALID_RESPONSE_FROM_TARGET | Yes |

A censor can poison DNS, drop packets or inject resets, and from the sender's side each looks like an outage, so every network failure except TLS goes to a proxy. Up to three healthy, non-blacklisted peers are tried in turn. A peer that cannot be reached is marked unhealthy, while one that answers but cannot reach the target is left alone. Any direct success marks a server healthy again, and health checks probe every unhealthy server whatever the reason.

To check these behaviours on four local nodes, run `tests/support/run-censorship.sh` (needs Postgres and Redis).


### Background Jobs (BullMQ)

Two Redis-backed queues handle asynchronous federation operations:

- **Federation delivery queue** — Encrypts and delivers activity (follows, posts, unfollows) to remote servers. 10 concurrent workers, up to 5 retries with exponential backoff (5s base). On success, the delivery job record is cleaned up automatically.
- **Health-check queue** — Probes unhealthy servers via `GET /discover` with exponential backoff (5min, 15min, 25min...), up to 5 attempts. If a server responds, it is re-marked healthy.

Workers are started automatically at application bootstrap in `src/server.ts`.

### Key Rotation

Federation identity is tied to two keypairs (Ed25519 for signing, X25519 for encryption). The `rotateKeys.ts` script walks through every known federation, proves ownership of both the old and new keys via a challenge-response protocol, and updates `.env.local` when all federations confirm.

Each rotation requires proving possession of **four** things to each peer:

1. Old signing key (sign a challenge nonce)
2. New signing key (sign a challenge nonce)
3. Old encryption key (decrypt a challenge nonce)
4. New encryption key (decrypt a challenge nonce)

Failed confirmations do **not** auto-blacklist the server — preventing griefing attacks where anyone could spam init for a victim URL to get them banned.

---

## Setup

### Prerequisites

- [Bun](https://bun.sh/) 1.3+ (runtime, tooling and key generation)
- [Node.js](https://nodejs.org/) only for `bun run build:matrix`, whose download script runs with `node`
- [PostgreSQL](https://www.postgresql.org/) 15+
- [Redis](https://redis.io/) 7+
- (Optional) [MinIO](https://min.io/) or any S3-compatible object store for media

### Environment Variables

Copy `.env.local.example` to `.env.local` and populate:

```env
# SiPher server URL (your canonical public address)
BETTER_AUTH_URL=https://your-server.com

# Better Auth secret (generate with: openssl rand -hex 32)
BETTER_AUTH_SECRET=<random-hex>

# PostgreSQL connection
DATABASE_URL=postgresql://user:password@host:5432/sipher

# Redis connection
REDIS_URL=redis://host:6379

# Federation signing keypair (Ed25519, base64)
# Generate with: bun run keygen
FEDERATION_PUBLIC_KEY=<base64>
FEDERATION_PRIVATE_KEY=<base64>

# Federation encryption keypair (X25519, base64)
FEDERATION_ENCRYPTION_PUBLIC_KEY=<base64>
FEDERATION_ENCRYPTION_PRIVATE_KEY=<base64>

# MinIO / S3 storage (optional, only if using media uploads)
MINIO_BUCKET=sipher
MINIO_ENDPOINT=minio.your-server.com
MINIO_PORT=443
MINIO_USE_SSL=true
MINIO_ACCESS_KEY=<access-key>
MINIO_SECRET_KEY=<secret-key>
# MINIO_REGION=us-east-1

# SMTP email (optional, used for verification emails)
EMAIL_HOST=smtp.your-server.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=noreply@your-server.com
EMAIL_PASSWORD=<password>

# Comma-separated list of allowed CORS origins for front-ends (default: any origin)
# CORS_ORIGINS=https://app.your-server.com

# Override the SSRF guard for these hosts. localhost and 127.0.0.1 are
# allowed by default only when NODE_ENV is not production.
# DEV_ALLOWED_HOSTNAMES=localhost,127.0.0.1,::1

# Reverse proxies in front of the server that append to X-Forwarded-For.
# 0 (default) ignores the header, so clients cannot spoof their IP.
# TRUSTED_PROXY_HOPS=1

# Debug logging namespaces
DEBUG=app:*,test:*
```

### Database

The schema is managed via Drizzle Kit. Everything is auto-generated from Better Auth's schema generator plus the custom plugin schemas.

```sh
# Push schema directly (development)
bun run db:push

# Regenerate src/lib/db/schema/index.ts from the Better Auth plugin schemas
bun run db:generate
bun run db:migrate
```

Run `bun run db:push` after pulling schema changes. The federation code relies on two unique indexes, `posts_federation_origin_uidx` (one copy of each remote post) and `remoteIdentityKeys_origin_uidx` (one pinned key per remote author), and on the `remote_identity_keys` table.

> ⚠️ `remoteIdentityKeys_origin_uidx` is declared in the oven plugin schema, so the generator keeps it. Better Auth only allows unique indexes on required fields, so `posts_federation_origin_uidx` and the two `serverRegistry` key indexes are written by hand in `src/lib/db/schema/index.ts`. `bun run db:generate` rewrites that file and then runs `src/lib/db/restore-indexes.ts`, which puts them back (and fails if it cannot), so `bun run db:update` is safe. If you run `auth generate` by hand, run that script before pushing.

**Upgrading from a pre-#8 deployment:** the direct follow path used to store the remote server in the wrong column (`followerServerUrl` and `followingServerUrl` were swapped), which breaks post delivery to existing remote followers. After `bun run db:push`, run once:

```sh
bun run db:backfill-follows -- --dry-run   # count affected rows
bun run db:backfill-follows                # swap them (idempotent)
```

### Federation Keys

```sh
bun run keygen
```

This runs `src/lib/federation/keygen.ts`, which generates both Ed25519 (signing) and X25519 (encryption) keypairs and writes them to `.env.local`.

---

## Scripts


| Command                             | Purpose                                                       |
| ----------------------------------- | ------------------------------------------------------------- |
| `bun run dev`                       | Start development server (enables private URLs for local dev) |
| `bun run start`                     | Production start (`bun src/server.ts`)                        |
| `bun run keygen`                    | Generate federation signing + encryption keys                 |
| `bun run build:matrix`              | Download native Matrix crypto binary (see note in PR)         |
| `bun run email:dev`                 | React Email dev server (port 3001)                            |
| `bun run db:push`                   | Push Drizzle schema to database                               |
| `bun run db:migrate`                | Push + migrate (two-step)                                     |
| `bun run db:generate`               | Regenerate Better Auth schema + Drizzle files                 |
| `bun run db:update`                 | Generate + push                                               |
| `bun run db:backfill-follows`       | One-off fix for follows stored before #8 (see Database)       |
| `bun run test`                      | Run Playwright e2e tests (`**/*.e2e.ts`)                      |
| `bun run test:federation`           | Key rotation e2e tests                                        |
| `bun run test:key`                  | Key rotation e2e tests only                                   |
| `bun run test:proxy`                | Proxy `/proxy` route e2e tests (single-server validation)     |
| `bun run docker:test:discover`      | `/discover` integration tests against the 3-instance cluster  |
| `bun run docker:test:proxy-chain`   | Proxy relay + failover integration tests                      |
| `bun run docker:test:post-delivery` | Federated post delivery integration test                      |


---

## Rotating Federation Keys

**Rotating Federation Keys**

Federation identity is tied to two keypairs (Ed25519 for signing, X25519 for encryption). The `rotateKeys.ts` script walks through every known federation, proves ownership of both the old and new keys via a challenge-response protocol, and updates `.env.local` when all federations confirm.

You **need** the old keys in order to run this script. If you lost them, there is currently no recovery mechanism.

### Prerequisites

- A running database with the server registry populated (at least one peer federation).
- `.env.local` with valid `FEDERATION_`* keys and `BETTER_AUTH_URL`.

### Basic rotation

```sh
bun run rotateKeys.ts
```

The script will:

1. List all federations in the registry.
2. Ask for confirmation before proceeding.
3. For each federation: request a challenge, solve it, and confirm.
4. On full success: back up `.env.local` and write the new keys.
5. On any failure: print a retry command and exit without writing keys.

### Retrying after partial failure

If some federations failed while others succeeded, the script prints a ready-to-copy command targeting only the failures:

```sh
bun run rotateKeys.ts --resume '<keys-json>' --only '<failed-urls>'
```

- `--resume <json>` — Reuse the new keys from the previous run instead of generating fresh ones (required because successful federations already registered them).
- `--only <urls>` — Comma-separated list of federation URLs to retry. Federations not in this list are skipped.

You can also retry all federations with just `--resume`:

```sh
bun run rotateKeys.ts --resume '<keys-json>'
```



---

## Tests

SiPher uses [Playwright](https://playwright.dev) for integration/e2e tests (matched by `**/*.e2e.ts`) and [Bun's test runner](https://bun.sh/docs/cli/test) for unit tests (matched by `**/*.test.ts`).

### Running tests

```sh
npm test                    # All Playwright e2e tests
bun run test:federation     # Discover + key rotation tests
bun run test:proxy          # Proxy relay tests
bun test                    # Bun unit tests (keytools, etc.)
```

Playwright starts the server automatically via `bun src/server.ts` with `NODE_ENV=test`. The Playwright suites that remain (`tests/proxy/proxy.e2e.ts`, `tests/federation/key-rotation.e2e.ts`) drive their own local DB state and don't need the federation cluster. Anything that exercises real peer-to-peer federation — `/discover` REGISTER/DISCOVER, proxy relay, federated post delivery — lives under `tests/integration/` and runs against the dockerized 3-instance cluster.

### Docker-based integration tests

Three integration scripts exercise the federation protocol against a real 3-instance Docker cluster (A, B, C) with mutual discovery. All three auto-create their own Better Auth users + identity keys via HTTP — no `--bearer` token needed.

```sh
# Run inside the Docker test cluster (A, B, C must be healthy):
docker compose -f tests/docker-compose.yml run --rm test-runner \
  tests/integration/discover.ts --peer http://sipher-c:3002

docker compose -f tests/docker-compose.yml run --rm test-runner \
  tests/integration/federation-post-delivery.ts \
  --proxy http://sipher-b:3001 --target http://sipher-c:3002

docker compose -f tests/docker-compose.yml run --rm test-runner \
  tests/integration/proxy-chain.ts \
  --proxy http://sipher-b:3001 --target http://sipher-c:3002
```

These test the `/discover` REGISTER and DISCOVER handshake with real encrypted envelopes, the Post → BullMQ delivery → proxy fallback pipeline, and the full PROXY/TARGETED relay chain respectively.

### Censorship matrix

`tests/support/run-censorship.sh` runs four local nodes without Docker and a `fetch` preload (`tests/support/netsim.ts`) that simulates DNS poisoning, refused or reset connections, silent drops and lost responses. It checks that posts still arrive through proxies, that dead or blacklisted proxies are skipped, that queued posts survive isolation, and that a duplicate delivery is stored once.

```sh
PGURL=postgresql://postgres@localhost:5432 tests/support/run-censorship.sh [--only S2,S3]
```

It needs a local Postgres superuser and Redis on `:6379`, and it recreates the databases `sipher_a` to `sipher_d`.

### Test coverage

- **Discover e2e** — SSRF guards, key mismatch rejection, REGISTER and DISCOVER happy paths, encrypted envelope validation.
- **Key rotation e2e** — Full init → solve → confirm flow, rate limiting, expired challenges, exhausted attempts without blacklist-griefing.
- **Proxy e2e** — PROXY and TARGETED validation, unknown sender rejection, blacklist enforcement, signature verification, replay window, duplicate follow rejection (scoped per follower server), author signature and key pinning on federated posts, rate limiting, payload size limits.
- **Keytools unit** — Encryption round-trip, tamper detection, signature verification, deterministic fingerprinting.
- **Integration (docker)** — Post delivery via proxy fallback, full proxy chain relay, discover round-trips.

---

## Roadmap

- **[X] Federation key rotation** — Challenge-response protocol for rotating Ed25519 + X25519 keypairs across all peers.
- **[X] Proxy relay** — Traffic routed through mutual peers when direct connections fail. Proxy is blind to content.
- **[X] Background delivery** — BullMQ queues for async federation delivery with retries and health monitoring.
- **[X] Serialization format** — The JSON-based federation schema (EncryptedEnvelope, FollowSchema, PostFederationSchema).
- **[X] SSRF protection** — URL guard blocking private/internal IPs, blocked hostnames, non-HTTP protocols.
- **[X] Client-side identity** — BIP-39 mnemonics, Ed25519 keypairs, encrypted IndexedDB storage, session key cache.
- **[X] Rate limiting** — Per-route and per-origin sliding-window rate limits enforced server-side.
- **[X] Threat model** — Error-code classification dictating proxy eligibility and health-check strategy.
- **[ ] User identity key rotation** — Rotate a user's identity key with a statement signed by the current key, so servers that pinned it accept the new one. A user who loses their mnemonic needs a separate, visible identity reset.
- **[ ] Discovery propagation** — When a new server is registered, propagate its existence to all known peers.
- **[ ] Server trust scoring** — A public vouch ledger so servers can signal trustworthiness about peers.
- **[ ] End-to-end encryption** — OLM device keys are already uploaded. The encrypted message transport ("Oven") needs to be wired into the messaging layer.
- **[ ] Clients** — SiPher ships no UI. Clients (feed, profiles, notifications, settings) are external consumers of the API, built on `src/sdk`.
- **[ ] Federation status dashboard** — View connected peers, health status, pending deliveries, and rotation logs.

---

## What is public/private?

### Public (visible to receiving federations)

Post content is encrypted in transit between servers (X25519 key agreement + HKDF + AES-256-GCM), but the receiving federation decrypts and stores the plaintext:

- **Posts**: Content (text, images, video, audio, links), authorId, publication date, and the federation of origin.
- **Profiles**: Username, display name, public key fingerprint.
- **Follow graph**: Who follows whom (used for federation routing to deliver posts to the right servers).

### Private (server-side, not federated)

- **Mutes/blocks**: Stored server-side, never sent to other federations.
- **Passwords**: Hashed by Better Auth, never stored in plaintext.

### Private (client-side, never sent to server)

- **Ed25519 secret key**: Derived from a BIP-39 mnemonic. Encrypted in IndexedDB (AES-256-GCM with PBKDF2, 600k iterations), decrypted on login and held in module memory + sessionStorage for tab-scoped persistence. Cleared on logout or tab close. Never transmitted to any server.
- **BIP-39 mnemonic**: Shown to the user once during identity creation, then discarded. The only recovery mechanism.

### Client-side signing

All social actions are signed by the user's Ed25519 identity key before submission:

- **Posts** — The `authorSignature` field contains a detached Ed25519 signature covering the canonical post payload (`postId`, `authorId`, `publishedAt`, `content`, `federationUrl`). The author's server verifies it before storage, and every receiving server verifies it again against the author's identity key, which travels with the post. Receivers pin that key per author (`remote_identity_keys`) on the first post and refuse later posts signed with another key (`409 AUTHOR_KEY_MISMATCH`), so a server cannot forge posts for its own users by swapping keys. A post must also come from the server named in its `federationUrl`. There is no rotation flow for user identity keys yet; a user who resets their identity will be refused by servers that pinned the old key.
- **Follows** — Follow requests and responses carry detached Ed25519 signatures (`requesterSignature`, `responderSignature`) covering a canonical payload that includes `federationUrl` to prevent cross-server replay.

---

## Security

SiPher implements custom federation and cryptographic protocols. I am not a professional cryptographer or security researcher — this system has not been audited and almost certainly contains multiple vulnerabilities I am not aware of.

### What SiPher does for safety

- **SSRF protection**: A URL guard (`url-guard.ts`) blocks private, loopback, link-local, CGNAT, multicast and reserved IPv4 ranges, IPv6 ULA, link-local and NAT64 addresses, IPv4-mapped IPv6 forms of all of these, blocked hostnames (localhost, metadata endpoints), and non-HTTP(S) protocols. Before each federation request the hostname is resolved and refused if any address is internal, and redirects are not followed. Only overridable via `DEV_ALLOWED_HOSTNAMES`. The DNS check and the request resolve separately, so DNS rebinding is not fully covered.
- **Replay window**: Every federated follow and post carries a signed `sentAt`. Receivers refuse messages older than 15 minutes (or more than 5 minutes in the future), and a post delivered twice inside that window is stored once. A repeated follow from the same server is acknowledged without a second row (direct path) or refused with `409 FOLLOW_ALREADY_EXISTS` (proxy path). User ids are only unique per server, so the same ids from another server are a different follow.
- **Federation encryption**: Posts, follows and proxy envelopes are encrypted with X25519 + AES-256-GCM (hybrid ECIES), with ephemeral keys per message. Discovery (`GET /discover`, `REGISTER`) is plain JSON, since it only carries public keys.
- **Canonical signatures**: Posts and follows are signed with a versioned byte format (`v: 2`) that includes the federation URL to prevent cross-server replay attacks.
- **Author key pinning**: Receivers verify each federated post's author signature and pin the author's identity key on first sight (see [Client-side signing](#client-side-signing)), so once a key is pinned a server cannot forge posts for its users by swapping keys. A post must come from the server named in its `federationUrl`. This is trust on first use: the key comes from the sending server, so a server that is malicious from the start can forge an author's posts on any receiver that has not pinned that author yet, and the forged key then sticks. Pins only defend against a server that turns malicious later; verifying keys out of band is on the roadmap with user key rotation.
- **Key rotation requires 4 proofs**: Possession of both old and new keypairs must be proven before keys are updated. Failed confirmations don't auto-blacklist (prevents griefing).
- **No secret key on server**: User Ed25519 secret keys never leave the browser. The server only stores public keys and OLM device key bundles.
- **Session-scoped key caching**: The signing key lives in module memory + sessionStorage (not localStorage). It is zeroed on logout and cleared when the tab closes.
- **Rate limiting**: Per-route sliding-window limits prevent abuse of registration, key rotation, and proxy endpoints. `X-Forwarded-For` is only trusted for `TRUSTED_PROXY_HOPS` hops.

If you find a vulnerability, please open an issue or contact me directly at [tocka@tockanest.com](mailto:tocka@tockanest.com). Responsible disclosure is appreciated.

Contributions from people with security or cryptography experience are especially welcome, even if just pure criticism.

**Do not use SiPher in any context where your physical safety depends on it — not yet.**

---

## Author

**Marcello Brito** (Tocka) — [tockanest.com](https://tockanest.com)

## Mirrors

[Forgejo](https://git.tockanest.com/Cete/sipher)

[GitHub](https://github.com/tockawaffle/sipher)

## License

[AGPL-3.0](./LICENSE)