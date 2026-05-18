# Bull — Federation Background Job Queue

## Overview

The `bull` module provides a Redis-backed background job processing system for the federation layer. It prevents long-running network operations — such as delivering activity payloads to remote servers or probing server health — from blocking the main request/response cycle.

Built on [BullMQ](https://docs.bullmq.io/), it exposes two queues and their corresponding workers:

- **Federation delivery queue** — encrypts and delivers activity payloads (follows, posts, inserts, unfollows) to remote servers, processes acknowledgment responses, and performs automatic cleanup of delivery records.
- **Health-check queue** — periodically probes servers marked as unhealthy, re-classifying them as healthy when they respond successfully, with exponential back-off and a configurable retry limit.

Workers are designed to be started once at application bootstrap and run for the lifetime of the process.

---

## Interfaces and Types

### `FederationDeliveryJob`

```ts
interface FederationDeliveryJob {
  deliveryJobId: string;
  targetUrl: string;
  serverUrl: string;
  payload: string;
}
```

Defines the data contract for a federation delivery job.

| Field           | Type     | Description                                                                   |
| --------------- | -------- | ----------------------------------------------------------------------------- |
| `deliveryJobId` | `string` | Primary key of the corresponding row in the `deliveryJobs` database table.    |
| `targetUrl`     | `string` | Full URL of the remote server's federation inbox endpoint.                    |
| `serverUrl`     | `string` | Origin URL of the target server (used for registry lookups and blacklisting). |
| `payload`       | `string` | Serialized JSON string containing the activity method and associated data.    |

### `HealthCheckJob`

```ts
interface HealthCheckJob {
  serverUrl: string;
}
```

Defines the data contract for a health-check job.

| Field       | Type     | Description                                |
| ----------- | -------- | ------------------------------------------ |
| `serverUrl` | `string` | The remote server URL to probe for health. |

---

## Exported Symbols and Functions

### `DELIVERY_QUEUE_NAME`

```ts
const DELIVERY_QUEUE_NAME = 'federation-delivery';
```

The Redis queue name for federation delivery jobs.

---

### `HEALTH_CHECK_QUEUE_NAME`

```ts
const HEALTH_CHECK_QUEUE_NAME = 'federation-health-check';
```

The Redis queue name for health-check jobs.

---

### `getRedisConnection()`

```ts
function getRedisConnection(): Redis
```

Returns a singleton Redis connection (via `ioredis`) configured with `maxRetriesPerRequest: null` as required by BullMQ. The connection URL is read from the `REDIS_URL` environment variable. Intended for queue producers (`getFederationQueue`, `getHealthCheckQueue`).

**Throws** if `REDIS_URL` is not set.

---

### `getRedisWorkerConnection()`

```ts
function getRedisWorkerConnection(): Redis
```

Returns a separate singleton Redis connection dedicated to BullMQ `Worker` instances. Keeping worker connections distinct from producer connections prevents back-pressure on queue-enqueue operations when workers are under high load.

**Throws** if `REDIS_URL` is not set.

---

### `getFederationQueue()`

```ts
function getFederationQueue(): Queue<FederationDeliveryJob>
```

Returns a singleton `Queue<FederationDeliveryJob>` instance backed by the `federation-delivery` queue.

**Default job options:**

| Option             | Value             | Rationale                                            |
| ------------------ | ----------------- | ---------------------------------------------------- |
| `attempts`         | `5`               | Up to 5 retries before the job is marked as failed.  |
| `backoff`          | exponential, 5s   | Delay doubles on each retry: 5s, 10s, 20s, 40s.      |
| `removeOnComplete` | `{ age: 86400 }`  | Completed jobs are pruned after 24 hours.            |
| `removeOnFail`     | `{ age: 604800 }` | Failed jobs are retained for 7 days for diagnostics. |

---

### `getHealthCheckQueue()`

```ts
function getHealthCheckQueue(): Queue<HealthCheckJob>
```

Returns a singleton `Queue<HealthCheckJob>` instance backed by the `federation-health-check` queue. No custom default job options are applied.

---

### `scheduleHealthCheck()`

```ts
function scheduleHealthCheck(serverUrl: string, attempt: number): Promise<void>
```

Schedules a delayed health-check job for a remote server.

**Parameters:**

| Parameter   | Type     | Description                                                       |
| ----------- | -------- | ----------------------------------------------------------------- |
| `serverUrl` | `string` | The remote server URL to check.                                   |
| `attempt`   | `number` | Zero-based attempt counter; used to compute the delay and job ID. |

**Internal logic:**

1. Computes the delay as `(5 + attempt * 10)` minutes.
2. Derives a deterministic job ID from the server URL using SHA-256 (first 16 hex chars) to avoid collisions between URLs that differ only in non-alphanumeric characters.
3. Adds a single-shot job (auto-removed on completion or failure) to the health-check queue.

**Returns:** `Promise<void>`

---

### `startFederationWorker()`

```ts
function startFederationWorker(): { deliveryWorker: Worker<FederationDeliveryJob>; healthCheckWorker: Worker<HealthCheckJob> }
```

Creates and returns a pair of BullMQ workers that process the federation delivery and health-check queues. This function is idempotent: subsequent calls return the same worker instances.

Workers use a dedicated Redis connection via `getRedisWorkerConnection()`, separate from the connection used by queue producers (`getRedisConnection()`). This prevents worker processing from starving queue-enqueue operations on the main thread.

**Delivery worker configuration:**

| Option        | Value |
| ------------- | ----- |
| `concurrency` | `10`  |

**Health-check worker configuration:**

| Option        | Value |
| ------------- | ----- |
| `concurrency` | `3`   |

**Lifecycle events:**

| Worker       | Event       | Behavior                                                                          |
| ------------ | ----------- | --------------------------------------------------------------------------------- |
| Delivery     | `ready`     | Logs a confirmation that the worker is connected to Redis.                        |
| Delivery     | `failed`    | Logs the job ID, method, target URL, attempt count, remaining retries, and error. |
| Delivery     | `completed` | Deletes the corresponding `deliveryJobs` database row.                            |
| Delivery     | `error`     | Logs a generic worker-level error to the console.                                 |
| Health-check | `ready`     | Logs a confirmation that the worker is connected to Redis.                        |
| Health-check | `failed`    | Logs the job ID and error message.                                                |
| Health-check | `error`     | Logs a generic worker-level error to the console.                                 |

**Returns:** `{ deliveryWorker, healthCheckWorker }`

---

### `processFederationDelivery(job)`

```ts
function processFederationDelivery(job: Job<FederationDeliveryJob>): Promise<void>
```

The core processor for federation delivery jobs. Executed by the delivery worker for each queue entry.

**Processing steps:**

1. **Method validation** — Parses the `payload` JSON and validates that the result is an object with a string-typed `method` field (guards against JSON primitives like `null`, `42`, or `"str"` that would pass JSON.parse but throw a TypeError on property access). If `method` is missing, non-string, or not one of `FEDERATE`, `FEDERATE_POST`, `INSERT`, `UNFOLLOW`, the job fails immediately with an `UnrecoverableError` and its `deliveryJobs` row is deleted.
2. **Blacklist check** — Queries the `blacklistedServers` table. If the `serverUrl` is blacklisted, the job is dropped with an `UnrecoverableError` and the row is cleaned up.
3. **Key resolution** — Looks up the target server in the `serverRegistry` table. If the server is not yet registered, automatic discovery is attempted via `discoverAndRegister()`. If discovery fails, a retryable error is thrown.
4. **Encryption** — Encodes the payload using the target server's `encryptionPublicKey` (base64-decoded into a `Uint8Array`) via `encryptPayload()`.
5. **Database update** — Sets `lastAttemptedAt` and increments `attempts` on the delivery job record.
6. **HTTP delivery** — Validates that `BETTER_AUTH_URL` is set (throws `UnrecoverableError` if missing). Signs the original plaintext payload with the local server's signing key and sends the encrypted payload via `federationFetch()` with a 15-second timeout and proxy fallback. A non-OK response throws a retryable error.
7. **Ack parsing** — Attempts to parse the response body as JSON (throws `UnrecoverableError` on non-JSON response). Inspects the payload for a `PROXY_RESPONSE` acknowledgment nested under `responseBody.payload`.
8. **Ack dispatch** — Routes the acknowledgment to a job-name-specific handler (e.g. `deliver-follow` → `handleFollowAck`). If no handler is registered, the ack is silently ignored.

**Throws:**

- `UnrecoverableError` — Malformed payload, missing or non-string method, invalid method, blacklisted server, missing `BETTER_AUTH_URL`, non-JSON response, or missing acknowledgment.
- `Error` — Auto-discovery failure or HTTP delivery failure (retryable by BullMQ).

---

### `processHealthCheck(job)`

```ts
function processHealthCheck(job: Job<HealthCheckJob>): Promise<void>
```

The core processor for health-check jobs. Executed by the health-check worker.

**Processing steps:**

1. **Server lookup** — Queries the `serverRegistry` table. If the server is not found or is already marked healthy, the job exits early.
2. **Threat-policy check** — If the server has an `unhealthyReason`, the corresponding threat policy is consulted via `getThreatPolicy()`. If the reason is not `directHealthCheckable`, the job skips further processing.
3. **Probe** — Sends an HTTP `GET` to `<serverUrl>/discover` with an 8-second timeout.
4. **Success** — If the response is OK, the server is marked healthy via `markServerHealthy()` and the job completes.
5. **Failure** — On HTTP error or network exception, the attempt counter is atomically incremented in the database via `sql` fragment (`healthCheckAttempts + 1`), avoiding read-modify-write races between concurrent worker instances. If fewer than `MAX_HEALTH_CHECK_ATTEMPTS` (5) have been made, a follow-up health-check job is scheduled with exponential delay. Once exhausted, a warning is logged and no further checks are scheduled.

**Returns:** `Promise<void>`

---

### `handleFollowAck(ackPayload, serverUrl, cachedServerPublicKey, deliveryJobId, jobId)`

```ts
function handleFollowAck(
  ackPayload: AckPayload,
  serverUrl: string,
  cachedServerPublicKey: string | undefined,
  deliveryJobId: string,
  jobId: string | undefined,
): Promise<void>
```

Processes the acknowledgment (`PROXY_RESPONSE`) for a `deliver-follow` job.

**Parameters:**

| Parameter               | Type                  | Description                                                                           |
| ----------------------- | --------------------- | ------------------------------------------------------------------------------------- |
| `ackPayload`            | `AckPayload`          | The acknowledgment payload containing signature and decrypted data.                   |
| `serverUrl`             | `string`              | Origin URL of the remote server.                                                      |
| `cachedServerPublicKey` | `string \| undefined` | The server's signing public key, if already known from the registry at delivery time. |
| `deliveryJobId`         | `string`              | ID of the delivery job record for cleanup.                                            |
| `jobId`                 | `string \| undefined` | BullMQ job ID for diagnostic logging.                                                 |

**Internal logic:**

1. Parses the decrypted payload against `FollowEnvelopeSchema`. Invalid payloads cause an `UnrecoverableError` and delete the delivery job record.
2. Resolves the remote server's signing public key (bumps the database if not cached from the delivery phase).
3. Verifies the cryptographic signature on the acknowledgment. A failed signature check throws `UnrecoverableError`.
4. Looks up the local `follows` row matching `followerId`, `followingId`, and `followerServerUrl`. If no matching row exists, the ack is silently ignored (the remote acknowledged a follow this node does not know about).
5. If the remote `accepted` is explicitly `false`, the local follow record is updated with `acknowledged: true` (the remote explicitly rejected the follow).
6. If the remote `accepted` is explicitly `true`, the local `accepted` column is updated to `true`.
7. If `accepted` is `undefined`/`null`, the local follow record is updated with `acknowledged: true` only (the remote acknowledged receipt without indicating an acceptance state).

**Throws:**

- `UnrecoverableError` — Invalid follow payload, missing signing public key, or signature verification failure.

---

## Usage Example

```ts
// app/bootstrap.ts
import { startFederationWorker, getFederationQueue, scheduleHealthCheck } from '@/lib/bull';

// ────────────────────────────────────────────
// Start workers at application bootstrap
// ────────────────────────────────────────────
const workers = startFederationWorker();
// workers.deliveryWorker   — processes federation-delivery queue
// workers.healthCheckWorker — processes federation-health-check queue

// ────────────────────────────────────────────
// Enqueue a federation delivery job
// ────────────────────────────────────────────
const queue = getFederationQueue();
await queue.add('deliver-follow', {
  deliveryJobId: 'abc-123',
  targetUrl: 'https://remote.example.com/inbox',
  serverUrl: 'https://remote.example.com',
  payload: JSON.stringify({
    method: 'FEDERATE',
    // ... activity data
  }),
});

// ────────────────────────────────────────────
// Schedule a delayed health check
// ────────────────────────────────────────────
await scheduleHealthCheck('https://remote.example.com', 0);
// Runs in ~5 minutes; doubles delay on each retry.
```

---

## Error Handling

### Unrecoverable Errors (BullMQ `UnrecoverableError`)

Jobs that throw `UnrecoverableError` are immediately marked as failed and **will not be retried**, even if the queue's `attempts` option is greater than 1.

| Scenario                       | Thrown From                 | Description                                                                |
| ------------------------------ | --------------------------- | -------------------------------------------------------------------------- |
| Malformed payload JSON         | `processFederationDelivery` | The job payload cannot be parsed as valid JSON.                            |
| Missing or non-string method   | `processFederationDelivery` | The `method` field is missing, not a string, or not in the allowed set.    |
| Blacklisted target server      | `processFederationDelivery` | The target server is in the `blacklistedServers` table.                    |
| Missing `BETTER_AUTH_URL`      | `processFederationDelivery` | The environment variable is not set; federation requests cannot be sent.   |
| Non-JSON response from remote  | `processFederationDelivery` | The remote returned a 200 OK with a non-JSON body.                         |
| Missing acknowledgment         | `processFederationDelivery` | The remote response does not contain a `PROXY_RESPONSE` payload.           |
| Invalid follow ack payload     | `handleFollowAck`           | The decrypted payload fails `FollowEnvelopeSchema` validation.             |
| Missing signing public key     | `handleFollowAck`           | The server has no `publicKey` in the registry to verify the ack signature. |
| Signature verification failure | `handleFollowAck`           | The cryptographic signature on the ack does not match.                     |

### Retryable Errors

Jobs that throw a regular `Error` are returned to the queue and retried according to the queue's backoff configuration.

| Scenario               | Thrown From                 | Description                                                                                |
| ---------------------- | --------------------------- | ------------------------------------------------------------------------------------------ |
| Auto-discovery failure | `processFederationDelivery` | The server is not in the registry and `discoverAndRegister` throws a non-`DiscoveryError`. |
| HTTP delivery failure  | `processFederationDelivery` | The remote endpoint returns a non-OK HTTP status code.                                     |
| Network / fetch error  | `processFederationDelivery` | `federationFetch` throws due to timeout, DNS failure, etc.                                 |

### Silent Skips (No Error)

| Scenario                       | Location             | Description                                                                |
| ------------------------------ | -------------------- | -------------------------------------------------------------------------- |
| Unhealthy reason not checkable | `processHealthCheck` | The server's threat policy forbids direct health checks.                   |
| Server already healthy         | `processHealthCheck` | The server is already marked healthy in the registry.                      |
| Server not in registry         | `processHealthCheck` | The server was removed or never registered.                                |
| Unknown follow ack             | `handleFollowAck`    | The local `follows` table has no matching row for the acknowledged follow. |

### Worker-Level Errors

Worker-level errors (e.g. Redis connection loss) are emitted via the worker's `error` event and logged to the console. These do **not** affect individual jobs; BullMQ will re-establish the connection automatically.
