import { canonicalFollowRequestBytes, canonicalFollowResponseBytes } from "@/lib/identity/followSignature";
import { canonicalPostBytes } from "@/lib/identity/postSignature";
import { isKeyUnlocked, sign as sessionSign } from "@/lib/identity/sessionKey";
import type { BetterAuthClientPlugin } from "better-auth/client";
import { v4 } from "uuid";
import { z } from "zod";
import type { sipherSocial } from "../server/social";

const clientPostContentSchmema = z.array(
	z.object(
		{
			type: z.enum(["text", "image", "video", "audio", "link"]),
			// value could be a string, a file, a url, etc.
			value: z.union([z.string(), z.instanceof(File), z.url()], { error: "Value must be a string, a file or a URL" }),
		}
	)
)

type SipherSocialPlugin = typeof sipherSocial;

export const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
export const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100MB
export const MAX_AUDIO_SIZE = 100 * 1024 * 1024; // 100MB
export const MAX_IMAGE_COUNT = 5; // 5 images per post
export const MAX_AUDIO_COUNT = 1; // 1 audio per post
export const MAX_VIDEO_COUNT = 2; // 2 videos per post

export const sipherSocialClientPlugin = () => {
	return {
		id: "sipher-social",
		$InferServerPlugin: {} as ReturnType<SipherSocialPlugin>,
		getActions($fetch, $store, options) {
			return {
				/**
				 * Author and submit a post.
				 *
				 * Each post is detached-Ed25519-signed via the in-memory session key
				 * store (populated once at login / identity creation). The server
				 * verifies the signature against the user's registered
				 * `signingPublicKey` before persisting the post.
				 *
				 * Throws `"Identity not unlocked"` if `unlockSessionKey` has not been
				 * called this session (e.g. a fresh tab opened without a login prompt).
				 *
				 * @param content  Content blocks (text/media/link).
				 * @param userId   Better Auth user id of the author.
				 */
				createPost: async (
					content: z.infer<typeof clientPostContentSchmema>,
					userId: string,
				) => {
					// Allow only these combinations of content:
					// 1. Text only
					// 2. Text and images
					// 3. Text, images and videos
					// 4. Text and audio
					// No other combinations are allowed
					const contentTypes = content.map((block) => block.type);
					if (contentTypes.length > 1) {
						if (contentTypes.includes("image") && contentTypes.includes("audio")) {
							throw new Error("Images and audios cannot be combined under the same post.")
						} else if (contentTypes.includes("video") && contentTypes.includes("audio")) {
							throw new Error("Videos and audios cannot be combined under the same post.")
						}
					}
					const imageCount = content.filter((block) => block.type === "image").length;
					const videoCount = content.filter((block) => block.type === "video").length;
					const audioCount = content.filter((block) => block.type === "audio").length;
					if (imageCount > MAX_IMAGE_COUNT) throw new Error("Maximum number of images per post exceeded");
					if (videoCount > MAX_VIDEO_COUNT) throw new Error("Maximum number of videos per post exceeded");
					if (audioCount > MAX_AUDIO_COUNT) throw new Error("Maximum number of audios per post exceeded");

					type ResolvedBlock =
						| { type: "text"; value: string }
						| { type: "link"; url: string }
						| { type: "image"; url: string; size: number; index: number }
						| { type: "video"; url: string; size: number; index: number }
						| { type: "audio"; url: string; size: number };

					const resolvedContent: ResolvedBlock[] = [];
					let mediaIndex = 0;

					for (const block of content) {
						if (block.type === "text") {
							resolvedContent.push({ type: "text", value: block.value as string });
							continue;
						}

						if (block.type === "link") {
							resolvedContent.push({ type: "link", url: block.value as string });
							continue;
						}

						const file = block.value as File;

						const { data, error } = await $fetch<{
							presignedUrl: string;
							objectUrl: string;
							objectKey: string;
						}>("/social/posts/files", {
							method: "POST",
							body: {
								fileName: file.name,
								mimeType: file.type,
								size: file.size,
							},
						});

						if (error || !data) {
							throw new Error("Failed to get upload URL");
						}

						const uploadRes = await fetch(data.presignedUrl, {
							method: "PUT",
							body: file,
							headers: { "Content-Type": file.type },
						});

						if (!uploadRes.ok) {
							throw new Error(`Failed to upload ${file.name}`);
						}

						if (block.type === "audio") {
							resolvedContent.push({ type: "audio", url: data.objectUrl, size: file.size });
						} else {
							resolvedContent.push({
								type: block.type as "image" | "video",
								url: data.objectUrl,
								size: file.size,
								index: mediaIndex++,
							});
						}
					}

					const postId = v4();
					const publishedAt = new Date().toISOString();

					if (!isKeyUnlocked()) {
						throw new Error("Identity not unlocked. Please enter your master password to unlock signing.");
					}

					const federationUrl = (options as { baseURL?: string } | undefined)?.baseURL
						?? (typeof window !== "undefined" ? window.location.origin : "");
					const sigBytes = sessionSign(
						canonicalPostBytes({ postId, authorId: userId, publishedAt, content: resolvedContent, federationUrl }),
					);
					const signature = Buffer.from(sigBytes).toString("base64");

					const { data, error } = await $fetch<{ id: string; federationDeliveriesQueued: number }>(
						"/social/posts",
						{
							method: "POST",
							body: {
								postId,
								publishedAt,
								signature,
								content: resolvedContent,
							},
						},
					);

					if (error || !data) {
						throw new Error("Failed to create post");
					}

					return { id: data.id, federationDeliveriesQueued: data.federationDeliveriesQueued };
				},
				/**
				 * Send a signed follow request to another user.
				 *
				 * The requester's Ed25519 identity key (from the session store) signs
				 * a canonical payload covering `followId`, `followerId`, `followingId`,
				 * and `createdAt`. The server verifies before persisting.
				 *
				 * Throws `"Identity not unlocked"` if the session key store is cold.
				 *
				 * @param targetUserId  The user being followed.
				 * @param currentUserId The authenticated user making the request (used
				 *                      in the canonical signature payload; must match
				 *                      the session on the server).
				 */
				followUser: async (targetUserId: string, currentUserId: string, federationUrl?: string) => {
					if (!isKeyUnlocked()) {
						throw new Error("Identity not unlocked. Please enter your master password to unlock signing.");
					}

					const followId = v4();
					const createdAt = new Date().toISOString();

					const ownServerUrl = (options as { baseURL?: string } | undefined)?.baseURL
						?? (typeof window !== "undefined" ? window.location.origin : "");
					const sigBytes = sessionSign(
						canonicalFollowRequestBytes({
							followId, followerId: currentUserId, followingId: targetUserId, createdAt,
							federationUrl: ownServerUrl,
						}),
					);

					const body: Record<string, string> = {
						method: "INSERT",
						userId: targetUserId,
						followId,
						createdAt,
						signature: Buffer.from(sigBytes).toString("base64"),
					};
					if (federationUrl) {
						body.federationUrl = federationUrl;
					}

					const { data, error } = await $fetch<{
						following: {
							id: string;
							createdAt: Date;
							followerId: string;
							followingId: string;
							accepted: boolean;
						};
					}>("/social/follows", {
						method: "POST",
						body,
					});
					if (error || !data) {
						throw new Error("Failed to follow user");
					}
					return data.following;
				},

				/**
				 * Accept or reject a pending follow request.
				 *
				 * The responder's Ed25519 identity key signs a canonical payload
				 * covering `followId`, `response`, and `timestamp`. The server
				 * verifies and updates the follow row.
				 *
				 * Throws `"Identity not unlocked"` if the session key store is cold.
				 */
				respondToFollow: async (followId: string, response: "accept" | "reject") => {
					if (!isKeyUnlocked()) {
						throw new Error("Identity not unlocked. Please enter your master password to unlock signing.");
					}

					const timestamp = new Date().toISOString();
					const ownServerUrl = (options as { baseURL?: string } | undefined)?.baseURL
						?? (typeof window !== "undefined" ? window.location.origin : "");
					const sigBytes = sessionSign(
						canonicalFollowResponseBytes({ followId, response, timestamp, federationUrl: ownServerUrl }),
					);
					const signature = Buffer.from(sigBytes).toString("base64");

					const { data, error } = await $fetch<{
						follow: {
							id: string;
							accepted: boolean;
							followerId: string;
							followingId: string;
							responderSignature: string;
						};
					}>("/social/follows", {
						method: "POST",
						body: { method: "RESPOND", followId, response, timestamp, signature },
					});
					if (error || !data) {
						throw new Error("Failed to respond to follow request");
					}
					return data.follow;
				}
			}
		},
	} satisfies BetterAuthClientPlugin;
};