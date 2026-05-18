/**
 * HTTP-based helpers that create Better Auth users against a running Sipher
 * instance (A, B, or C in the test cluster) and register the user-identity
 * Ed25519 keys that the Oven and social plugins require for follows / posts.
 *
 * Test scripts running inside the Docker network call this helper instead of
 * being passed `--bearer <token>` manually, so the entire integration
 * suite can boot a fresh cluster, create its own users, sign and submit
 * payloads, and shut everything down without hoomans in the loop.
 *
 * Returned `identity.signingPublicKey` matches the format expected by
 * `/api/auth/oven/identity/register` and the follow/post signature verifiers
 * (base58 of the raw 32-byte Ed25519 verification key). The fingerprint format
 * mirrors `generateUserKeyPair` in `src/lib/federation/keytools.ts`:
 * `base58(sha256(base64(publicKey)))`.
 */

import { binary_to_base58 } from "@/lib/federation/keytools";
import { canonicalFollowRequestBytes } from "@/lib/identity/followSignature";
import { canonicalPostBytes } from "@/lib/identity/postSignature";
import { createHash, randomBytes } from "node:crypto";
import nacl from "tweetnacl";

const FETCH_TIMEOUT_MS = 15_000;

interface IdentityKeyPair {
	/** Base58 of the 32-byte Ed25519 verification key. */
	signingPublicKey: string;
	/** Raw 64-byte Ed25519 secret key (nacl form: seed || public). */
	signingSecretKey: Uint8Array;
	/** Base58 of sha256(base64(publicKey)). */
	fingerprint: string;
}

export interface SipherTestUser {
	instanceUrl: string;
	userId: string;
	email: string;
	password: string;
	username: string;
	bearerToken: string;
	identity: IdentityKeyPair;
}

export interface CreateUserOptions {
	emailPrefix?: string;
	name?: string;
	password?: string;
	usernamePrefix?: string;
}

function randomSuffix(len = 10): string {
	return crypto.randomUUID().replace(/-/g, "").slice(0, len);
}

/**
 * The auth config has the `haveIBeenPwned()` plugin enabled, which rejects any
 * password found in the HIBP breach database. A hex random gives 64+ bits of
 * entropy in a small alphabet so the result is virtually guaranteed to be a
 * miss — `T#` and `!2026` keep the upper / digit / symbol mix in case future
 * password policy plugins are added.
 */
function strongRandomPassword(): string {
	return `T#${randomBytes(24).toString("hex")}!2026`;
}

async function readJsonSafe(res: Response): Promise<unknown> {
	try {
		return await res.json();
	} catch {
		try {
			return await res.text();
		} catch {
			return null;
		}
	}
}

function generateUserIdentityKeyPair(): IdentityKeyPair {
	const signing = nacl.sign.keyPair();
	const signingPubB64 = Buffer.from(signing.publicKey).toString("base64");
	const fingerprintBytes = createHash("sha256").update(signingPubB64).digest();
	return {
		signingPublicKey: binary_to_base58(signing.publicKey),
		signingSecretKey: signing.secretKey,
		fingerprint: binary_to_base58(new Uint8Array(fingerprintBytes)),
	};
}

/**
 * Sign up + sign in + register identity in three sequential HTTP calls.
 *
 * Requires the target instance to expose:
 *   • Better Auth email/password (POST /api/auth/sign-up/email, /sign-in/email)
 *   • The `bearer()` plugin (returns `set-auth-token` on sign-in)
 *   • The Sipher Oven plugin (POST /api/auth/oven/identity/register)
 */
export async function createSipherUser(
	instanceUrl: string,
	opts: CreateUserOptions = {},
): Promise<SipherTestUser> {
	const baseUrl = instanceUrl.replace(/\/$/, "");
	const suffix = randomSuffix(10);
	const email = `${opts.emailPrefix ?? "test"}-${suffix}@sipher.test`;
	const name = opts.name ?? `Test User ${suffix}`;
	const password = opts.password ?? strongRandomPassword();
	const username = `${opts.usernamePrefix ?? "testuser"}_${suffix}`.toLowerCase();

	// 1. Sign up — autoSignIn is false in this project's auth.ts, so the response
	// has no session/token; we sign in below to get the bearer token.
	const signUpRes = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ email, password, name, username }),
		signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
	});
	if (!signUpRes.ok) {
		const body = await readJsonSafe(signUpRes);
		throw new Error(`signUp on ${baseUrl} failed (${signUpRes.status}): ${JSON.stringify(body)}`);
	}
	const signUpBody = (await readJsonSafe(signUpRes)) as { user?: { id?: string }; id?: string } | null;
	const userId = signUpBody?.user?.id ?? signUpBody?.id;
	if (!userId) {
		throw new Error(`signUp on ${baseUrl} returned no user.id: ${JSON.stringify(signUpBody)}`);
	}

	// 2. Sign in to obtain the bearer token.
	const signInRes = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ email, password }),
		signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
	});
	if (!signInRes.ok) {
		const body = await readJsonSafe(signInRes);
		throw new Error(`signIn on ${baseUrl} failed (${signInRes.status}): ${JSON.stringify(body)}`);
	}
	const bearerToken = signInRes.headers.get("set-auth-token");
	if (!bearerToken) {
		throw new Error(
			`signIn on ${baseUrl} returned no \`set-auth-token\` header — is the bearer plugin enabled?`,
		);
	}
	// Drain the body so the connection can be reused.
	await readJsonSafe(signInRes);

	// 3. Register the user's stable identity key.
	const identity = generateUserIdentityKeyPair();
	const registerRes = await fetch(`${baseUrl}/api/auth/oven/identity/register`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${bearerToken}`,
		},
		body: JSON.stringify({
			signingPublicKey: identity.signingPublicKey,
			fingerprint: identity.fingerprint,
		}),
		signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
	});
	if (!registerRes.ok) {
		const body = await readJsonSafe(registerRes);
		throw new Error(
			`identity register on ${baseUrl} failed (${registerRes.status}): ${JSON.stringify(body)}`,
		);
	}

	return { instanceUrl: baseUrl, userId, email, password, username, bearerToken, identity };
}

/**
 * Authenticated `POST /api/auth/social/follows` with `INSERT` method on `user`'s
 * instance, signed with `user.identity.signingSecretKey`. The `followingUserId`
 * is the user being followed; `targetFederationUrl` is the homeserver of that
 * user (omit for a local follow).
 */
async function followUserOverHttp(
	user: SipherTestUser,
	params: { followingUserId: string; targetFederationUrl?: string },
): Promise<{ followId: string; raw: unknown }> {
	const followId = crypto.randomUUID();
	const createdAt = new Date().toISOString();
	const federationUrl = params.targetFederationUrl ?? user.instanceUrl;

	const msg = canonicalFollowRequestBytes({
		followId,
		followerId: user.userId,
		followingId: params.followingUserId,
		createdAt,
		federationUrl: user.instanceUrl,
	});
	const sig = nacl.sign.detached(msg, user.identity.signingSecretKey);
	const signature = Buffer.from(sig).toString("base64");

	const body: Record<string, unknown> = {
		method: "INSERT",
		userId: params.followingUserId,
		followId,
		createdAt,
		signature,
	};
	if (params.targetFederationUrl && params.targetFederationUrl !== user.instanceUrl) {
		body.federationUrl = federationUrl;
	}

	const res = await fetch(`${user.instanceUrl}/api/auth/social/follows`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${user.bearerToken}`,
		},
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
	});
	const json = await readJsonSafe(res);
	if (!res.ok) {
		throw new Error(`follow INSERT on ${user.instanceUrl} failed (${res.status}): ${JSON.stringify(json)}`);
	}
	return { followId, raw: json };
}

export interface PostContentBlock {
	type: "text" | "image" | "video" | "audio" | "link";
	value?: string;
	url?: string;
	[k: string]: unknown;
}

/**
 * Authenticated `POST /api/auth/social/posts` signed with the author's identity
 * key. Returns the API response body (which includes `id` and
 * `federationDeliveriesQueued`).
 */
export async function createPostOverHttp(
	author: SipherTestUser,
	content: PostContentBlock[],
): Promise<{ postId: string; federationDeliveriesQueued: number; raw: unknown }> {
	const postId = crypto.randomUUID();
	const publishedAt = new Date().toISOString();

	const msg = canonicalPostBytes({
		postId,
		authorId: author.userId,
		publishedAt,
		content,
		federationUrl: author.instanceUrl,
	});
	const sig = nacl.sign.detached(msg, author.identity.signingSecretKey);
	const signature = Buffer.from(sig).toString("base64");

	const res = await fetch(`${author.instanceUrl}/api/auth/social/posts`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${author.bearerToken}`,
		},
		body: JSON.stringify({ postId, publishedAt, signature, content }),
		signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
	});
	const json = (await readJsonSafe(res)) as { id?: string; federationDeliveriesQueued?: number } | null;
	if (!res.ok) {
		throw new Error(`createPost on ${author.instanceUrl} failed (${res.status}): ${JSON.stringify(json)}`);
	}
	return {
		postId: json?.id ?? postId,
		federationDeliveriesQueued: json?.federationDeliveriesQueued ?? 0,
		raw: json,
	};
}
