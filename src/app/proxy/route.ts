import db from "@/lib/db";
import { blacklistedServers, follows, serverRegistry, user } from "@/lib/db/schema";
import { FederationError, federationFetch } from "@/lib/federation/fetch";
import { decryptPayload, encryptPayload, getOwnEncryptionSecretKey, getOwnSigningSecretKey, signMessage, verifySignature } from "@/lib/federation/keytools";
import { peerRegistryUrlOrNull } from "@/lib/federation/peer-registry-url";
import { applyFederatedPostInTransaction } from "@/lib/federation/proxy-helpers/federated-post";
import { discoverAndRegister } from "@/lib/federation/registry";
import { EncryptedEnvelopeBaseSchema } from "@/lib/zod/EncryptedEnvelope";
import { FollowEnvelopeSchema } from "@/lib/zod/methods/FollowSchema";
import { PostEnvelopeSchema } from "@/lib/zod/methods/PostFederationSchema";
import createDebug from "debug";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const debug = createDebug("app:api:federation:proxy");

// Proxy route: relays encrypted federation traffic when two servers can't reach each other directly
// (e.g. network restrictions, ISP blocking).
//
// Any federation node can act as a proxy as long as both the requesting and target federations
// have discovered and registered it (same mutual-trust model as the follow endpoint).
//
// What the proxy knows:
//   - The target federation's base URL (passed in plaintext so the proxy can forward).
//   - That Federation A is trying to communicate with Federation B.
//
// What the proxy does NOT know:
//   - The contents of the request (method, path, payload, etc.) — all of that lives inside an
//     encrypted envelope that only Federation B can decrypt.
//
// Flow:
//   1. Federation A encrypts the full request (method, path, payload) into an envelope using
//      Federation B's encryption public key, and signs it with its own signing key.
//   2. Federation A sends the encrypted envelope + target URL to the proxy.
//   3. The proxy forwards the envelope to Federation B's proxy endpoint.
//   4. Federation B decrypts, validates the signature, and processes the request.
//   5. Federation B encrypts its response using Federation A's encryption public key.
//   6. The encrypted response travels back: Federation B -> Proxy -> Federation A.
//
// If the request is of PROXY type and the target fails, the proxy will return a 502 error in which the first server
// should then either retry the request later or proxy it to a different server.
// If the target does not know the sender, it'll error with a 403 error and a "UNKNOWN_FEDERATION_SERVER_INTERACTION" code.

const ProxiedDataSchema = z.discriminatedUnion("method", [
	z.object({
		method: z.literal("PROXY"),
		targetUrl: z.url().refine((url) => {
			// Check if the URL has the proxy path
			const parsedUrl = new URL(url);
			return parsedUrl.pathname.startsWith("/proxy");
		}, { message: "The target URL must have the proxy path" }), // Federation B's base URL,
		publicSigningKey: z.string().optional().nullable(), // Federation A's signing public key
		publicEncryptionKey: z.string().optional().nullable(), // Federation A's encryption public key
		payload: EncryptedEnvelopeBaseSchema // Opaque — proxy cannot decrypt
	}),
	z.object({
		method: z.literal("TARGETED"),
		payload: EncryptedEnvelopeBaseSchema // TODO: swap for createEncryptedEnvelopeSchema(TargetedPayloadSchema) once the inner schema is defined
	})
])

type ERROR_CODE = "MISSING_FED_ORIGIN_HEADER" | "UNKNOWN_FEDERATION_SERVER_INTERACTION" | "INCORRECT_KEYS" | "INVALID_PROXY_DATA";

// TARGETED: This federation is the target of a proxy request
// PROXY: This federation is the proxy for another federation
type PROXY_METHOD = "TARGETED" | "PROXY" | "PROXY_RESPONSE";

type PostsActions = "GET_USER_POSTS" | "FEDERATE_POST" | "GET_POST_BY_ID" | "GET_POST_COMMENTS" | "FEDERATE_POST_COMMENT"
type UserActions = "FEDERATE_FOLLOW" | "FEDERATE_UNFOLLOW" | "GET_USER_PROFILE" | "BLOCK_USER" | "UNBLOCK_USER" | "GET_USER_FOLLOWERS" | "GET_USER_FOLLOWING"

type Actions = PostsActions | UserActions;

export async function POST(request: NextRequest) {
	const getFedUrl = request.headers.get("x-federation-origin");
	if (!getFedUrl) {
		debug("Missing x-federation-origin header from %s", request.url);
		return NextResponse.json({ error: "Missing x-federation-origin header", code: "MISSING_FED_ORIGIN_HEADER" }, { status: 400 });
	}

	const data = await request.clone().json();
	const parsed = ProxiedDataSchema.safeParse(data);
	if (!parsed.success) {
		debug("POST /proxy – error parsing proxied data from %s: %s", request.url, parsed.error.message);
		return NextResponse.json({ error: "Invalid proxied data", code: "INVALID_PROXY_DATA" }, { status: 400 });
	}

	switch (parsed.data.method) {
		case "PROXY": {
			try {

				if (!parsed.data.publicSigningKey || !parsed.data.publicEncryptionKey) {
					debug("POST /proxy – error parsing proxied data from %s: %s", request.url, "Missing public signing or encryption key");
					return NextResponse.json({ error: "Invalid proxied data", code: "INVALID_PROXY_DATA" }, { status: 400 });
				}

				const proxiedData = parsed.data;

				// Verify Federation A (sender) is known and keys match
				const [sender] = await db.select().from(serverRegistry).where(eq(serverRegistry.url, getFedUrl));

				if (!sender) {
					debug("POST /proxy – sender not found in registry: %s", getFedUrl);
					return NextResponse.json({
						error: "Unknown federation server. Please redo the discovery process and try again.",
						code: "UNKNOWN_FEDERATION_SERVER_INTERACTION",
					}, { status: 403 });
				} else if (sender.publicKey !== proxiedData.publicSigningKey) {
					debug("POST /proxy – sender signing key mismatch: %s", getFedUrl);
					return NextResponse.json({
						error: "The provided keys are a mismatch. If you rotated your keys, we are not aware of it.",
						code: "INCORRECT_KEYS",
					}, { status: 403 });
				} else if (sender.encryptionPublicKey !== proxiedData.publicEncryptionKey) {
					debug("POST /proxy – sender encryption key mismatch: %s", getFedUrl);
					return NextResponse.json({
						error: "The provided keys are a mismatch. If you rotated your keys, we are not aware of it.",
						code: "INCORRECT_KEYS",
					}, { status: 403 });
				}

				// Verify Federation B (target) is known to us (prevents open-relay abuse)
				const targetBaseUrl = new URL(proxiedData.targetUrl.toString()).origin;
				const [target] = await db.select().from(serverRegistry).where(eq(serverRegistry.url, targetBaseUrl));

				if (!target) {
					debug("POST /proxy – target not found in registry: %s", targetBaseUrl);
					debug("POST /proxy - Starting discovery process")
					await discoverAndRegister(targetBaseUrl);
				}

				// Proxy the request to Federation B as a TARGETED request (no proxy fallback — we ARE the proxy)
				let forwardResponse: Response;
				try {
					const result = await federationFetch(proxiedData.targetUrl.toString(), {
						method: "POST",
						body: JSON.stringify({
							method: "TARGETED" as PROXY_METHOD,
							payload: proxiedData.payload,
						}),
						headers: {
							"Content-Type": "application/json",
							"X-Federation-Origin": process.env.BETTER_AUTH_URL!,
							"Origin": process.env.BETTER_AUTH_URL!,
							"X-Federation-Sender": getFedUrl,
						},
						serverUrl: targetBaseUrl,
						proxyFallback: false,
						skipHealthUpdate: true,
					});
					forwardResponse = result.response;
				} catch (err) {
					if (err instanceof FederationError) {
						debug("POST /proxy – federation error proxying to %s: %s", proxiedData.targetUrl.toString(), err.code);
						return NextResponse.json({ error: "Failed to proxy request", code: "FAILED_TO_PROXY_REQUEST", federationError: err.code, method: "PROXY_RESPONSE" as PROXY_METHOD }, { status: 502 });
					}
					throw err;
				}

				if (!forwardResponse.ok) {
					debug("POST /proxy – error proxying request to %s: %s", proxiedData.targetUrl.toString(), forwardResponse.statusText);
					return NextResponse.json({ error: "Failed to proxy request", code: "FAILED_TO_PROXY_REQUEST", details: await forwardResponse.json(), method: "PROXY_RESPONSE" as PROXY_METHOD }, { status: 502 });
				}

				const responseBody = await forwardResponse.json();

				// Return the response from Federation B as a PROXY_RESPONSE
				return NextResponse.json({
					method: "PROXY_RESPONSE" as PROXY_METHOD,
					payload: responseBody,
				});

			} catch (error) {
				debug("POST /proxy – error parsing proxied data from %s: %s", request.url, error);
				return NextResponse.json({ error: "Invalid proxied data", code: "INVALID_PROXY_DATA" }, { status: 400 });
			}
		}
		case "TARGETED": {
			try {
				// 🚨 we've been targeted, the 🧃 are coming, everyone to the bunkers! 🚨

				// We need to use the EncryptedEnvelopeBaseSchema here because we do not know what we are being targeted for
				// This is the information we'll have at the end of the day:
				// - The requester's url
				// - The requester's public signing key
				// - The requester's public encryption key
				// - The request data, being the method, path, and payload

				if (!parsed.data.payload) {
					debug("POST /proxy – error parsing targeted data from %s: %s", request.url, "Missing payload");
					return NextResponse.json({ error: "Invalid targeted data", code: "INVALID_TARGETED_DATA" }, { status: 400 });
				}

				const decryptedPayload = decryptPayload(parsed.data.payload, getOwnEncryptionSecretKey());
				const parsedPayload = JSON.parse(decryptedPayload);

				debug("POST /proxy – parsed targeted data from %s: %o", request.url, parsedPayload);

				const payloadSchema = z.object({
					targetUrl: z.url(),
					method: z.string(),
					headers: z.record(z.string(), z.string()),
					body: z.string().transform((body) => {
						const parsedBody = JSON.parse(body);
						return {
							method: parsedBody.method,
							payload: parsedBody.payload,
							signature: parsedBody.signature,
						};
					})
				}).superRefine((data, ctx) => {
					try {
						const originPayloadHeaders = data.headers;
						debug("POST /proxy – origin payload headers: %o", originPayloadHeaders);
						if (!originPayloadHeaders["X-Federation-Target"] || !originPayloadHeaders["X-Federation-Origin"] || !originPayloadHeaders["Origin"]) {
							ctx.addIssue({ code: "custom", message: "Missing headers" });
							return z.NEVER;
						}

						// Should be the base URL of the target URL
						const targetUrl = new URL(data.targetUrl).origin;
						const federationTargetOriginHeader = new URL(originPayloadHeaders["X-Federation-Target"]).origin;
						debug("POST /proxy – target URL: %s", targetUrl);
						debug("POST /proxy – x-federation-target header: %s", federationTargetOriginHeader);
						if (federationTargetOriginHeader !== targetUrl) {
							ctx.addIssue({ code: "custom", message: "x-federation-target header mismatch" });
							return z.NEVER;
						}
					} catch (error) {
						ctx.addIssue({ code: "custom", message: "Decryption failed" });
						return z.NEVER;
					}
				});

				const validated = payloadSchema.safeParse(parsedPayload);
				if (!validated.success) {
					debug("POST /proxy – error validating targeted data from %s: %s", request.url, validated.error.message);
					return NextResponse.json({ error: "Invalid targeted data", code: "INVALID_TARGETED_DATA" }, { status: 400 });
				}

				const { targetUrl, method, headers, body } = validated.data;

				// Check if the sender is known, keys match and is not blackisted
				const result = await db.transaction(async (tx) => {

					const senderUrl = headers["X-Federation-Origin"];
					// Check if the sender is blacklisted
					const [blacklisted] = await tx.select().from(blacklistedServers).where(eq(blacklistedServers.serverUrl, senderUrl));
					if (blacklisted) {
						debug("POST /proxy – sender is blacklisted: %s", senderUrl);
						return { error: "The federation server was blacklisted from interacting with this federation server. Please contact support to unblacklist your server.", code: "BLACKLISTED_FEDERATION_SERVER", action: undefined, status: 403 };
					}

					// Check if the sender is known
					const [sender] = await tx.select().from(serverRegistry).where(eq(serverRegistry.url, senderUrl));
					if (!sender) {
						debug("POST /proxy – sender not found in registry: %s", senderUrl);
						return { error: "Unknown federation server. Please redo the discovery process and try again.", code: "UNKNOWN_FEDERATION_SERVER_INTERACTION", action: undefined, status: 403 };
					}

					let consolidatedFollowPayload: z.infer<typeof FollowEnvelopeSchema> | null = null;
					let consolidatedPostPayload: z.infer<typeof PostEnvelopeSchema> | null = null;
					let action: Actions;
					switch (true) {
						case targetUrl.includes("/api/auth/social/follows") && body.method === "FEDERATE": {
							debug("POST /proxy – parsing follow payload: %s", body.payload);
							const payload = FollowEnvelopeSchema.safeParse(body.payload);
							if (!payload.success) {
								debug("POST /proxy – error parsing follow payload: %s", body.payload);
								return { error: "Invalid follow payload", code: "INVALID_FOLLOW_PAYLOAD", action: undefined, status: 400 };
							}
							consolidatedFollowPayload = payload.data;
							action = "FEDERATE_FOLLOW";
							break;
						}
						case targetUrl.includes("/api/auth/social/posts") && body.method === "FEDERATE_POST": {
							debug("POST /proxy – parsing federated post payload");
							const payload = PostEnvelopeSchema.safeParse(body.payload);
							if (!payload.success) {
								debug("POST /proxy – error parsing federated post payload: %s", payload.error.message);
								return { error: "Invalid federated post payload", code: "INVALID_FEDERATED_POST_PAYLOAD", action: undefined, status: 400 };
							}
							consolidatedPostPayload = payload.data;
							action = "FEDERATE_POST";
							break;
						}
						default: {
							debug("POST /proxy – no endpoint specific parsing, rejecting request");
							return { error: "Invalid payload", code: "INVALID_PAYLOAD", action: undefined, status: 400 };
						}
					}

					const signedEnvelope = consolidatedFollowPayload ?? consolidatedPostPayload;
					if (!signedEnvelope) {
						return { error: "Invalid payload", code: "INVALID_PAYLOAD", action: undefined, status: 400 };
					}

					// Check if the signature is valid
					const senderPublicKey = new Uint8Array(Buffer.from(sender.publicKey, "base64"));
					const senderEncryptionPublicKey = new Uint8Array(Buffer.from(sender.encryptionPublicKey, "base64"));
					if (!verifySignature(signedEnvelope._raw, body.signature, senderPublicKey)) {
						debug("POST /proxy – sender signature is invalid: %s", targetUrl);
						return { error: "The provided signature is invalid. Please redo the discovery process and try again.", code: "INVALID_SIGNATURE", action: undefined, status: 403 };
					}

					debug("POST /proxy – sender is known, keys match and is not blackisted: %s", targetUrl);

					// Now we can assume that:
					// - The sender is known to us
					// - The sender is not blacklisted
					// - The signature is valid with what we have in the payload
					// - The payload is a valid action and has a valid payload
					// - There is a known endpoint for the action
					// Now the only thing left is to handle the action. This cannot be done in a worker since we need to return a response to the proxy server. This could eventually overload this endpoint and cause issues, but it's not something I can fix right now.

					switch (action) {
						case "FEDERATE_FOLLOW": {
							const followEnv = consolidatedFollowPayload!;
							debug("POST /proxy – federating follow: %s", followEnv);

							// We can do the follow procedure
							// First check if the user exists
							const [targetUser] = await tx.select().from(user).where(eq(user.id, followEnv.following.followingId));
							if (!targetUser) {
								debug("POST /proxy – target user not found: %s", followEnv.following.followingId);
								return { error: "The user you are trying to follow does not exist.", code: "USER_NOT_FOUND", status: 404 };
							}

							// Second check if the follow already exists
							const [existingFollow] = await tx.select().from(follows).where(and(
								eq(follows.followerId, followEnv.following.followerId),
								eq(follows.followingId, followEnv.following.followingId),
							));

							if (existingFollow) {
								debug("POST /proxy – follow already exists: %s", existingFollow.id);
								return { error: "You are already following this user.", code: "FOLLOW_ALREADY_EXISTS", status: 409 };
							}

							// Third check if the user is private
							const isPrivate = !targetUser.isPrivate;

							const following = await tx.insert(follows).values({
								id: crypto.randomUUID(),
								followerId: followEnv.following.followerId,
								followingId: followEnv.following.followingId,
								accepted: isPrivate,
								createdAt: new Date(),
								followerServerUrl: peerRegistryUrlOrNull(senderUrl),
								followingServerUrl: peerRegistryUrlOrNull(targetUrl),
							}).returning();

							const row = following[0];
							// Same plaintext shape as the delivery job payload / FollowInnerPayloadSchema (see federation worker).
							const innerPayload = JSON.stringify({
								following: {
									id: row.id,
									createdAt: row.createdAt,
									followerId: row.followerId,
									followingId: row.followingId,
									accepted: row.accepted,
									followerServerUrl: row.followerServerUrl,
								},
								federationUrl: senderUrl,
								method: "FEDERATE" as const,
							});
							const signature = signMessage(innerPayload, getOwnSigningSecretKey());

							return { innerPayload, signature, senderEncryptionPublicKey };
						}
						case "FEDERATE_POST": {
							const postEnv = consolidatedPostPayload!;
							const postResult = await applyFederatedPostInTransaction(tx, postEnv, body.signature, {
								publicKey: sender.publicKey,
								encryptionPublicKey: sender.encryptionPublicKey,
								url: sender.url,
							});
							if (!postResult.ok) {
								return {
									error: postResult.error,
									code: postResult.code,
									action: undefined,
									status: postResult.status,
								};
							}
							const encKey = new Uint8Array(Buffer.from(postResult.senderEncryptionPublicKeyB64, "base64"));
							return {
								innerPayload: postResult.innerPayload,
								signature: postResult.signature,
								senderEncryptionPublicKey: encKey,
							};
						}
						default: {
							debug("POST /proxy – no action specific handling, rejecting request");
							return { error: "Invalid action", code: "INVALID_ACTION", action: undefined, status: 400 };
						}
					}

				});

				if (result.error) {
					return NextResponse.json({ error: result.error, code: result.code, action: result.action, status: result.status }, { status: result.status });
				}

				return NextResponse.json({
					method: "PROXY_RESPONSE" as PROXY_METHOD,
					status: "acknowledged",
					data: encryptPayload(result.innerPayload!, result.senderEncryptionPublicKey!),
					signature: result.signature,
				}, { status: 200 });

			} catch (error) {
				debug("POST /proxy – error parsing targeted data from %s: %s", request.url, error);
				return NextResponse.json({ error: "Invalid targeted data", code: "INVALID_PROXY_DATA" }, { status: 400 });
			}
		}
	}
}