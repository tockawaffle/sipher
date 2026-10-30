import { z } from "zod";
import { createEncryptedEnvelopeSchema } from "../EncryptedEnvelope";
import { sentAtSchema } from "../freshness";

const FollowInnerPayloadSchema = z.object({
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
	sentAt: sentAtSchema,
});

export const FollowEnvelopeSchema = createEncryptedEnvelopeSchema(FollowInnerPayloadSchema);
