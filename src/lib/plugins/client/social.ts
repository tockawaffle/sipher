import type { BetterAuthClientPlugin } from "better-auth/client";
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
				createPost: async (content: z.infer<typeof clientPostContentSchmema>) => {

					// Allow only these combinations of content:
					// 1. Text only
					// 2. Text and images
					// 3. Text, images and videos
					// 4. Text and audio
					// No other combinations are allowed
					// Check the content types and throw an error if the combination is not allowed
					const contentTypes = content.map((block) => block.type);
					if (contentTypes.length > 1) {
						if (contentTypes.includes("image") && contentTypes.includes("audio")) {
							throw new Error("Images and audios cannot be combined under the same post.")
						} else if (contentTypes.includes("video") && contentTypes.includes("audio")) {
							throw new Error("Videos and audios cannot be combined under the same post.")
						}
					}
					// Check if the content amount per type is under the allowed limits
					const imageCount = content.filter((block) => block.type === "image").length;
					const videoCount = content.filter((block) => block.type === "video").length;
					const audioCount = content.filter((block) => block.type === "audio").length;
					if (imageCount > MAX_IMAGE_COUNT) throw new Error("Maximum number of images per post exceeded");
					if (videoCount > MAX_VIDEO_COUNT) throw new Error("Maximum number of videos per post exceeded");
					if (audioCount > MAX_AUDIO_COUNT) throw new Error("Maximum number of audios per post exceeded");

					const resolvedContent: { type: string; value?: string; url?: string; size?: number; index?: number }[] = [];
					let mediaIndex = 0;

					for (const block of content) {
						if (block.type === "text" || block.type === "link") {
							resolvedContent.push({ type: block.type, value: block.value as string });
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

						resolvedContent.push({
							type: block.type,
							url: data.objectUrl,
							size: file.size,
							index: mediaIndex++,
						});
					}

					console.log("Resolved content:", resolvedContent);
				}
			}
		},
	} satisfies BetterAuthClientPlugin;
};