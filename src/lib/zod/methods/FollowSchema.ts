import { z } from "zod";
import { createEncryptedEnvelopeSchema } from "../EncryptedEnvelope";

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
});

export const FollowEnvelopeSchema = createEncryptedEnvelopeSchema(FollowInnerPayloadSchema);
export default FollowInnerPayloadSchema;
