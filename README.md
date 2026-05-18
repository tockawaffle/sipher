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

SiPher runs as a single Node.js process that serves both the web app and the federation API.


| Layer          | Technology                                                                            |
| -------------- | ------------------------------------------------------------------------------------- |
| Framework      | Next.js 16 (App Router, React 19, standalone output)                                  |
| Authentication | [Better Auth](https://better-auth.com) — email/password, username, 2FA, bearer tokens |
| Database       | PostgreSQL via [Drizzle ORM](https://orm.drizzle.team)                                |
| Cache / Queues | Redis — session storage, rate limiting, BullMQ background jobs                        |
| Object Storage | MinIO (S3-compatible) — media uploads with presigned URLs                             |
| Client Storage | IndexedDB (Dexie) — encrypted identity keypairs                                       |
| Real-time      | Socket.IO — firehose channel for live updates                                         |
| UI             | Tailwind CSS v4, shadcn/ui, Radix primitives, Framer Motion                           |


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


| Error            | Proxy-Eligible | Direct Health-Checkable |
| ---------------- | -------------- | ----------------------- |
| DNS_BLOCKED      | Yes            | No                      |
| TLS_ERROR        | No             | Yes                     |
| TIMEOUT          | No             | Yes                     |
| CONN_REFUSED     | No             | Yes                     |
| INVALID_RESPONSE | Yes            | No                      |


### Background Jobs (BullMQ)

Two Redis-backed queues handle asynchronous federation operations:

- **Federation delivery queue** — Encrypts and delivers activity (follows, posts, unfollows) to remote servers. 10 concurrent workers, up to 5 retries with exponential backoff (5s base). On success, the delivery job record is cleaned up automatically.
- **Health-check queue** — Probes unhealthy servers via `GET /discover` with exponential backoff (5min, 15min, 25min...), up to 5 attempts. If a server responds, it is re-marked healthy.

Workers are started automatically at application bootstrap via Next.js `instrumentation.ts`.

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

- [Node.js](https://nodejs.org/) 20+
- [Bun](https://bun.sh/) (for tooling scripts and key generation)
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
# Generate with: npm run keygen
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

# SMTP email (optional, used for verification emails)
EMAIL_HOST=smtp.your-server.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=noreply@your-server.com
EMAIL_PASSWORD=<password>

# Development only: override SSRF guard to allow private IPs
# DEV_ALLOWED_HOSTNAMES=localhost,127.0.0.1,::1

# Debug logging namespaces
DEBUG=app:*,test:*
```

### Database

The schema is managed via Drizzle Kit. Everything is auto-generated from Better Auth's schema generator plus the custom plugin schemas.

```sh
# Push schema directly (development)
npm run db:push

# Or generate a migration and apply it
npm run db:generate
npm run db:migrate
```

### Federation Keys

```sh
npm run keygen
```

This runs `src/lib/federation/keygen.ts`, which generates both Ed25519 (signing) and X25519 (encryption) keypairs and writes them to `.env.local`.

---

## Scripts


| Command                             | Purpose                                                       |
| ----------------------------------- | ------------------------------------------------------------- |
| `npm run dev`                       | Start development server (enables private URLs for local dev) |
| `npm run build`                     | `next build`                                                  |
| `npm run start`                     | Production start (`node src/server.ts`)                       |
| `npm run keygen`                    | Generate federation signing + encryption keys                 |
| `npm run build:matrix`              | Download native Matrix crypto WASM binary                     |
| `npm run email:dev`                 | React Email dev server (port 3001)                            |
| `npm run db:push`                   | Push Drizzle schema to database                               |
| `npm run db:migrate`                | Push + migrate (two-step)                                     |
| `npm run db:generate`               | Regenerate Better Auth schema + Drizzle files                 |
| `npm run db:update`                 | Generate + push                                               |
| `npm run test`                      | Run Playwright e2e tests (`**/*.e2e.ts`)                      |
| `npm run test:federation`           | Key rotation e2e tests                                        |
| `npm run test:key`                  | Key rotation e2e tests only                                   |
| `npm run test:proxy`                | Proxy `/proxy` route e2e tests (single-server validation)     |
| `npm run docker:test:discover`      | `/discover` integration tests against the 3-instance cluster  |
| `npm run docker:test:proxy-chain`   | Proxy relay + failover integration tests                      |
| `npm run docker:test:post-delivery` | Federated post delivery integration test                      |


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
npm run test:federation     # Discover + key rotation tests
npm run test:proxy          # Proxy relay tests
bun test                    # Bun unit tests (keytools, etc.)
```

Playwright starts the server automatically via `tsx src/server.ts` with `NODE_ENV=test`. The Playwright suites that remain (`tests/proxy/proxy.e2e.ts`, `tests/federation/key-rotation.e2e.ts`) drive their own local DB state and don't need the federation cluster. Anything that exercises real peer-to-peer federation — `/discover` REGISTER/DISCOVER, proxy relay, federated post delivery — lives under `tests/integration/` and runs against the dockerized 3-instance cluster.

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

### Test coverage

- **Discover e2e** — SSRF guards, key mismatch rejection, REGISTER and DISCOVER happy paths, encrypted envelope validation.
- **Key rotation e2e** — Full init → solve → confirm flow, rate limiting, expired challenges, exhausted attempts without blacklist-griefing.
- **Proxy e2e** — PROXY and TARGETED validation, unknown sender rejection, blacklist enforcement, signature verification, duplicate follow rejection, rate limiting, payload size limits.
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
- **[ ] Discovery propagation** — When a new server is registered, propagate its existence to all known peers.
- **[ ] Server trust scoring** — A public vouch ledger so servers can signal trustworthiness about peers.
- **[ ] End-to-end encryption** — OLM device keys are already uploaded. The encrypted message transport ("Oven") needs to be wired into the messaging layer.
- **[ ] Web UI** — The frontend is minimal (dev test form and auth pages). A proper feed, profile pages, notifications, and settings UI need to be built.
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

- **Posts** — The `authorSignature` field contains a detached Ed25519 signature covering the canonical post payload (`postId`, `authorId`, `publishedAt`, `content`, `federationUrl`). Verified server-side before storage.
- **Follows** — Follow requests and responses carry detached Ed25519 signatures (`requesterSignature`, `responderSignature`) covering a canonical payload that includes `federationUrl` to prevent cross-server replay.

---

## Security

SiPher implements custom federation and cryptographic protocols. I am not a professional cryptographer or security researcher — this system has not been audited and almost certainly contains multiple vulnerabilities I am not aware of.

### What SiPher does for safety

- **SSRF protection**: A URL guard (`url-guard.ts`) blocks requests to private/internal IPv4 ranges (127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, link-local), IPv6 ULA and link-local addresses, blocked hostnames (localhost, metadata endpoints), and non-HTTP(S) protocols. Only overridable via `DEV_ALLOWED_HOSTNAMES` env var.
- **Federation encryption**: All cross-server payloads are encrypted with X25519 + AES-256-GCM (hybrid ECIES). Ephemeral keys per message.
- **Canonical signatures**: Posts and follows are signed with a versioned byte format (`v: 2`) that includes the federation URL to prevent cross-server replay attacks.
- **Key rotation requires 4 proofs**: Possession of both old and new keypairs must be proven before keys are updated. Failed confirmations don't auto-blacklist (prevents griefing).
- **No secret key on server**: User Ed25519 secret keys never leave the browser. The server only stores public keys and OLM device key bundles.
- **Session-scoped key caching**: The signing key lives in module memory + sessionStorage (not localStorage). It is zeroed on logout and cleared when the tab closes.
- **Rate limiting**: Per-route sliding-window limits prevent abuse of registration, key rotation, and proxy endpoints.

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