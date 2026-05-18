import { getFederationQueue } from "@/lib/bull";
import db from "@/lib/db";
import { blacklistedServers, blocks, deliveryJobs, follows, serverRegistry, user, userIdentityKeys } from "@/lib/db/schema";
import { base58_to_binary, verifySignature } from "@/lib/federation/keytools";
import { peerRegistryUrlOrNull } from "@/lib/federation/peer-registry-url";
import { discoverAndRegister, DiscoveryError } from "@/lib/federation/registry";
import { canonicalFollowRequestBytes, canonicalFollowResponseBytes } from "@/lib/identity/followSignature";
import { FollowEnvelopeSchema } from "@/lib/zod/methods/FollowSchema";
import { createAuthEndpoint, getSessionFromCtx } from "better-auth/api";
import createDebug from "debug";
import { and, eq } from "drizzle-orm";
import nacl from "tweetnacl";
import { z } from "zod";

const debug = createDebug("app:plugins:server:helpers:social:follows");

const followSchema = z.discriminatedUnion(
	"method", [
	z.object({
		method: z.literal("INSERT"),
		userId: z.string(),
		followId: z.string().uuid(),
		createdAt: z.string().datetime(),
		signature: z.string().min(1),
		federationUrl: z.url().optional(),
	}),
	z.object({
		method: z.literal("FEDERATE"),
		signature: z.string(),
		payload: FollowEnvelopeSchema
	}),
	z.object({
		method: z.literal("UNFOLLOW"),
		userId: z.string(),
	}),
	z.object({
		method: z.literal("RESPOND"),
		followId: z.string().uuid(),
		response: z.enum(["accept", "reject"]),
		timestamp: z.string().datetime(),
		signature: z.string().min(1),
	}),
], { error: "Invalid follow method" },
)

export const followUser = createAuthEndpoint("/social/follows", {
	method: "POST",
	body: followSchema,
}, async (context) => {

	const { method } = context.body;
	switch (method) {
		case "INSERT": {
			const session = await getSessionFromCtx(context);
			if (!session) {
				return context.json({ error: "Unauthorized" }, { status: 401 });
			};

			const { userId, federationUrl, followId, createdAt, signature } = context.body;

			// Verify the requester's Ed25519 signature against their registered key.
			const [identity] = await db
				.select({ signingPublicKey: userIdentityKeys.signingPublicKey })
				.from(userIdentityKeys)
				.where(eq(userIdentityKeys.userId, session.user.id))
				.limit(1);

			if (!identity) {
				return context.json({ error: "Requester has no registered identity key." }, { status: 403 });
			}

			let sigValid = false;
			try {
				const publicKey = base58_to_binary(identity.signingPublicKey);
				const sigBytes = Uint8Array.from(Buffer.from(signature, "base64"));
				const msg = canonicalFollowRequestBytes({
					followId, followerId: session.user.id, followingId: userId, createdAt,
					federationUrl: process.env.BETTER_AUTH_URL!,
				});
				sigValid = nacl.sign.detached.verify(msg, sigBytes, publicKey);
			} catch (err) {
				debug("follow INSERT signature verification threw: %o", err);
			}

			if (!sigValid) {
				return context.json({ error: "Invalid follow request signature." }, { status: 403 });
			}

			const ownUrl = process.env.BETTER_AUTH_URL!;
			const isLocal = !federationUrl || federationUrl === ownUrl;

			const [existingFollow] = await db
				.select({ id: follows.id })
				.from(follows)
				.where(and(
					eq(follows.followerId, session.user.id),
					eq(follows.followingId, userId),
				))
				.limit(1);

			if (existingFollow) {
				return context.json({ error: "You are already following this user." }, { status: 409 });
			}

			if (isLocal) {
				const [targetUser] = await db
					.select({ id: user.id, isPrivate: user.isPrivate })
					.from(user)
					.where(eq(user.id, userId))
					.limit(1);

				if (!targetUser) {
					return context.json({ error: "User not found." }, { status: 404 });
				}

				// Reject if the target user has blocked the requester.
				const [existingBlock] = await db
					.select({ id: blocks.id })
					.from(blocks)
					.where(and(
						eq(blocks.blockerId, userId),
						eq(blocks.blockedUserId, session.user.id),
					))
					.limit(1);

				if (existingBlock) {
					return context.json({ error: "Unable to follow this user." }, { status: 403 });
				}

				const following = await db.insert(follows).values({
					id: followId,
					followerId: session.user.id,
					followingId: userId,
					accepted: !targetUser.isPrivate,
					createdAt: new Date(createdAt),
					requesterSignature: signature,
				}).returning();

				return context.json({ following }, { status: 200 });
			}

			const serverUrl = federationUrl!.toString().replace(/\/+$/, '');

			const [blacklisted] = await db
				.select({ id: blacklistedServers.id })
				.from(blacklistedServers)
				.where(eq(blacklistedServers.serverUrl, serverUrl))
				.limit(1);

			if (blacklisted) {
				return context.json({ error: "This server has been blocked." }, { status: 403 });
			}

			const [existing] = await db
				.select({ url: serverRegistry.url })
				.from(serverRegistry)
				.where(eq(serverRegistry.url, serverUrl))
				.limit(1);

			if (!existing) {
				try {
					debug("FOLLOW – discovering and registering server %s", serverUrl);
					await discoverAndRegister(serverUrl);
				} catch (err) {
					if (err instanceof DiscoveryError) {
						debug("discovery failed for %s: %s", serverUrl, err.message);
						return context.json({ error: "Could not reach the federation server." }, { status: 502 });
					}
					throw err;
				}
			}

			const following = await db.insert(follows).values({
				id: followId,
				followerId: session.user.id,
				followingId: userId,
				accepted: false,
				createdAt: new Date(createdAt),
				followerServerUrl: peerRegistryUrlOrNull(serverUrl),
				requesterSignature: signature,
			}).returning();

			const job = await db.insert(deliveryJobs).values({
				id: crypto.randomUUID(),
				targetUrl: serverUrl + "/api/auth/social/follows",
				payload: JSON.stringify({ following: following[0], federationUrl: ownUrl, method: "FEDERATE" }),
				attempts: 0,
				createdAt: new Date(),
			}).returning();

			await getFederationQueue().add("deliver-follow", {
				deliveryJobId: job[0].id,
				targetUrl: job[0].targetUrl,
				serverUrl,
				payload: JSON.stringify({ following: following[0], federationUrl: ownUrl, method: "FEDERATE" }),
			});

			return context.json({ following }, { status: 200 });
		}
		case "RESPOND": {
			const session = await getSessionFromCtx(context);
			if (!session) {
				return context.json({ error: "Unauthorized" }, { status: 401 });
			}

			const { followId, response, timestamp, signature } = context.body;

			// The responder must own the followingId on this follow row.
			const [follow] = await db
				.select({
					id: follows.id,
					followerId: follows.followerId,
					followingId: follows.followingId,
					responderSignature: follows.responderSignature,
				})
				.from(follows)
				.where(eq(follows.id, followId))
				.limit(1);

			if (!follow) {
				return context.json({ error: "Follow request not found." }, { status: 404 });
			}

			if (follow.followingId !== session.user.id) {
				return context.json({ error: "Only the target user can respond to this follow request." }, { status: 403 });
			}

			if (follow.responderSignature) {
				return context.json({ error: "This follow request has already been responded to." }, { status: 409 });
			}

			// Verify the responder's signature.
			const [identity] = await db
				.select({ signingPublicKey: userIdentityKeys.signingPublicKey })
				.from(userIdentityKeys)
				.where(eq(userIdentityKeys.userId, session.user.id))
				.limit(1);

			if (!identity) {
				return context.json({ error: "Responder has no registered identity key." }, { status: 403 });
			}

			let sigValid = false;
			try {
				const publicKey = base58_to_binary(identity.signingPublicKey);
				const sigBytes = Uint8Array.from(Buffer.from(signature, "base64"));
				const msg = canonicalFollowResponseBytes({ followId, response, timestamp, federationUrl: process.env.BETTER_AUTH_URL! });
				sigValid = nacl.sign.detached.verify(msg, sigBytes, publicKey);
			} catch (err) {
				debug("follow RESPOND signature verification threw: %o", err);
			}

			if (!sigValid) {
				return context.json({ error: "Invalid follow response signature." }, { status: 403 });
			}

			const accepted = response === "accept";

			const [updated] = await db
				.update(follows)
				.set({ accepted, responderSignature: signature })
				.where(eq(follows.id, followId))
				.returning();

			return context.json({ follow: updated }, { status: 200 });
		}
		case "FEDERATE": {
			const { payload, signature } = context.body;

			if (!payload || payload instanceof z.ZodNever || !("following" in payload) || !("federationUrl" in payload)) {
				return context.json({ error: "Invalid payload", code: "INVALID_PAYLOAD" }, { status: 400 });
			}

			const { following, federationUrl, _raw } = payload;

			const [server] = await db
				.select({ url: serverRegistry.url, publicKey: serverRegistry.publicKey })
				.from(serverRegistry)
				.where(eq(serverRegistry.url, federationUrl))
				.limit(1);

			if (!server) {
				return context.json({
					error: "Unknown federation server. Please redo the discovery process and try again.",
					code: "UNKNOWN_FEDERATION_SERVER_INTERACTION",
				}, { status: 403 });
			}

			const senderPublicKey = new Uint8Array(Buffer.from(server.publicKey, "base64"));
			if (!verifySignature(_raw, signature, senderPublicKey)) {
				return context.json({
					error: "Signature verification failed.",
					code: "INVALID_SIGNATURE",
				}, { status: 403 });
			}

			const [targetUser] = await db
				.select({ id: user.id, isPrivate: user.isPrivate })
				.from(user)
				.where(eq(user.id, following.followingId))
				.limit(1);

			if (!targetUser) {
				return context.json({
					error: "The user being followed does not exist on this server.",
					code: "USER_NOT_FOUND",
				}, { status: 404 });
			}

			// Reject if the local target user has blocked the remote follower.
			const [federatedBlock] = await db
				.select({ id: blocks.id })
				.from(blocks)
				.where(and(
					eq(blocks.blockerId, following.followingId),
					eq(blocks.blockedUserId, following.followerId),
				))
				.limit(1);

			if (federatedBlock) {
				return context.json({ error: "Unable to follow this user." }, { status: 403 });
			}

			const accepted = !targetUser.isPrivate;

			await db.insert(follows).values({
				id: crypto.randomUUID(),
				followerId: following.followerId,
				followingId: following.followingId,
				accepted,
				createdAt: new Date(),
				followingServerUrl: peerRegistryUrlOrNull(server.url),
			}).onConflictDoNothing();

			return context.json({ status: "acknowledged", accepted }, { status: 200 });
		}
		case "UNFOLLOW": {
			return context.json({ error: "Not implemented" }, { status: 501 });
		}
		default: {
			return context.json({ error: "Invalid method" }, { status: 400 });
		}
	}
})

export const getFollows = createAuthEndpoint("/social/follows/following", {
	method: "GET",
}, async (context) => { })

export const getFollowers = createAuthEndpoint("/social/follows/followers", {
	method: "GET",
}, async (context) => { })