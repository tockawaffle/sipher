import { getFederationQueue } from "@/lib/bull";
import db from "@/lib/db";
import { blacklistedServers, deliveryJobs, follows, serverRegistry, user } from "@/lib/db/schema";
import { decryptPayload, getOwnEncryptionSecretKey, verifySignature } from "@/lib/federation/keytools";
import { discoverAndRegister, DiscoveryError } from "@/lib/federation/registry";
import { createAuthEndpoint, getSessionFromCtx } from "better-auth/api";
import createDebug from "debug";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

const debug = createDebug("app:plugins:server:helpers:social:follows");

const followSchema = z.discriminatedUnion(
	"method", [
	z.object({
		method: z.literal("INSERT"),
		userId: z.string(),
		federationUrl: z.url().optional(),
	}),
	z.object({
		method: z.literal("FEDERATE"),
		signature: z.string(),
		payload: z.object({
			ephemeralPublicKey: z.string(),
			iv: z.string(),
			ciphertext: z.string(),
			authTag: z.string(),
		}).transform((payload, ctx) => {
			try {
				const decrypted = decryptPayload(payload, getOwnEncryptionSecretKey());
				const parsedPayload = JSON.parse(decrypted);

				const parsedPayloadSchema = z.object({
					following: z.object({
						id: z.string(),
						createdAt: z.coerce.date(),
						followerId: z.string(),
						followingId: z.string(),
						accepted: z.boolean(),
						followerServerUrl: z.string().nullable(),
					}),
					federationUrl: z.string(),
					method: z.literal("FEDERATE"),
				}).safeParse(parsedPayload);
				if (!parsedPayloadSchema.success) {
					ctx.addIssue({ code: "custom", message: "Invalid payload" });
					return z.never();
				}
				return { ...parsedPayloadSchema.data, _raw: decrypted };
			} catch {
				ctx.addIssue({ code: "custom", message: "Invalid payload" });
				return z.never();
			}
		}),
	}),
	z.object({
		method: z.literal("UNFOLLOW"),
		userId: z.string(),
	}),
], { error: "Invalid follow method" },
)

export const followUser = createAuthEndpoint("/social/follows", {
	method: "POST",
	body: followSchema,
}, async (context) => {
	debug("FOLLOW – %s", context.body.method);
	const { method } = context.body;
	switch (method) {
		case "INSERT": {
			const session = await getSessionFromCtx(context);
			debug("FOLLOW – user: %o", session);
			if (!session) {
				return context.json({ error: "Unauthorized" }, { status: 401 });
			};

			const { userId, federationUrl } = context.body;
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

				const following = await db.insert(follows).values({
					id: crypto.randomUUID(),
					followerId: session.user.id,
					followingId: userId,
					accepted: !targetUser.isPrivate,
					createdAt: new Date(),
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
				id: crypto.randomUUID(),
				followerId: session.user.id,
				followingId: userId,
				accepted: false,
				createdAt: new Date(),
				followerServerUrl: serverUrl,
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

			const accepted = !targetUser.isPrivate;

			await db.insert(follows).values({
				id: crypto.randomUUID(),
				followerId: following.followerId,
				followingId: following.followingId,
				accepted,
				createdAt: new Date(),
				followingServerUrl: server.url,
			});

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