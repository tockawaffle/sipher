import { BetterAuthPluginDBSchema } from "better-auth";
import { z } from "zod";

const postContentBlockSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("text"),
		value: z.string().min(1, "Text content cannot be empty"),
	}),
	z.object({
		type: z.literal("image"),
		url: z.url("Image must be a valid URL"),
		index: z.number().min(0, "Index must be a positive number"),
		size: z.number().min(0, "Size must be a positive number"),
	}),
	z.object({
		type: z.literal("video"),
		url: z.url("Video must be a valid URL"),
		size: z.number().min(0, "Size must be a positive number"),
		index: z.number().min(0, "Index must be a positive number"),
	}),
	z.object({
		type: z.literal("audio"),
		url: z.url("Audio must be a valid URL"),
		size: z.number().min(0, "Size must be a positive number"),
	}),
	z.object({
		type: z.literal("link"),
		url: z.url("Link must be a valid URL"),
	}),
], { error: 'Block "type" must be one of: text, image, video, audio, link' });

export const postContentSchema = z
	.array(postContentBlockSchema, { error: "Post content must be an array of blocks" })
	.min(1, "Post must contain at least one content block");

export default {
	posts: {
		fields: {
			content: {
				type: "json",
				required: true,
				index: false,
				transform: {
					output: (value) => {
						let parsed: unknown;
						try {
							parsed = typeof value === "string" ? JSON.parse(value) : value;
						} catch {
							throw new Error("Post content is not valid JSON");
						}

						const validated = postContentSchema.safeParse(parsed);
						if (!validated.success) {
							const issues = validated.error.issues
								.map((i) => `[${i.path.join(".")}] ${i.message}`)
								.join("; ");
							throw new Error(`Invalid post content: ${issues}`);
						}

						return validated.data;
					}
				}
			},
			authorId: {
				type: "string",
				required: true,
				index: false,
				references: {
					model: "user",
					field: "id"
				}
			},
			published: {
				type: "date",
				required: true,
				index: false,
			},
			// "isLocal" will be used to determine if the post should only exist
			// on the local server or if it should be propagated to other servers
			isLocal: {
				type: "boolean",
				required: true,
				index: false,
				defaultValue: false,
			},
			// "isPrivate" will be used to determine if the post should be visible only for the user's followers
			isPrivate: {
				type: "boolean",
				required: false,
				index: false,
				defaultValue: false,
			},
			createdAt: {
				type: "date",
				required: true,
				index: false
			}
		}
	},
	follows: {
		fields: {
			followerId: {
				type: "string",
				required: true,
				index: false,
				references: {
					model: "user",
					field: "id"
				}
			},
			followingId: {
				type: "string",
				required: true,
				index: false,
				references: {
					model: "user",
					field: "id"
				}
			},
			accepted: {
				type: "boolean",
				required: true,
				index: false,
				defaultValue: false,
			},
			createdAt: {
				type: "date",
				required: true,
				index: false
			}
		}
	},
	deliveryJobs: {
		fields: {
			targetUrl: {
				type: "string",
				required: true,
				index: false
			},
			// This could be encrypted, so we're not using a transform function to check for validity
			payload: {
				type: "string",
				required: true,
				index: false
			},
			attempts: {
				type: "number",
				required: true,
				index: false,
				defaultValue: 0,
			},
			lastAttemptedAt: {
				type: "date",
				required: false,
				index: false,
			},
			nextAttemptAt: {
				type: "date",
				required: false,
				index: false,
			},
			createdAt: {
				type: "date",
				required: true,
				index: false
			}
		}
	},
	mutes: {
		fields: {
			userId: {
				type: "string",
				required: true,
				index: false,
				references: {
					model: "user",
					field: "id"
				}
			},
			mutedUserId: {
				type: "string",
				required: true,
				index: false,
				references: {
					model: "user",
					field: "id"
				}
			},
			createdAt: {
				type: "date",
				required: true,
				index: false
			}
		}
	},
	blocks: {
		fields: {
			blockerId: {
				type: "string",
				required: true,
				index: false,
				references: {
					model: "user",
					field: "id"
				}
			},
			blockedUserId: {
				type: "string",
				required: true,
				index: false,
				references: {
					model: "user",
					field: "id"
				}
			},
			createdAt: {
				type: "date",
				required: true,
				index: false
			}
		}
	}
} satisfies BetterAuthPluginDBSchema