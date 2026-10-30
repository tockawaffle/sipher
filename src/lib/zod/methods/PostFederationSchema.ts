import { postContentSchema } from "@/lib/plugins/social/server/helpers/social";
import { z } from "zod";
import { createEncryptedEnvelopeSchema } from "../EncryptedEnvelope";
import { sentAtSchema } from "../freshness";

const PostInnerPayloadSchema = z.object({
	post: z.object({
		id: z.string(),
		content: postContentSchema,
		/** User id on the sending federation node (not required to exist on the recipient). */
		authorId: z.string(),
		published: z.string(),
		isPrivate: z.boolean(),
		/** The author's own Ed25519 signature over the post (see canonicalPostBytes). */
		authorSignature: z.string().min(1),
	}),
	federationUrl: z.string(),
	method: z.literal("FEDERATE_POST"),
	sentAt: sentAtSchema,
});

export const PostEnvelopeSchema = createEncryptedEnvelopeSchema(PostInnerPayloadSchema);
