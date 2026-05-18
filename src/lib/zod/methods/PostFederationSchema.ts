import { postContentSchema } from "@/lib/plugins/social/server/helpers/social";
import { z } from "zod";
import { createEncryptedEnvelopeSchema } from "../EncryptedEnvelope";

const PostInnerPayloadSchema = z.object({
	post: z.object({
		id: z.string(),
		content: postContentSchema,
		/** User id on the sending federation node (not required to exist on the recipient). */
		authorId: z.string(),
		published: z.string(),
		isPrivate: z.boolean(),
	}),
	federationUrl: z.string(),
	method: z.literal("FEDERATE_POST"),
});

export const PostEnvelopeSchema = createEncryptedEnvelopeSchema(PostInnerPayloadSchema);
