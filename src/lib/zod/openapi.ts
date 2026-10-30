import { z } from "zod";

/**
 * OpenAPI `requestBody` for a Better Auth endpoint whose body is a Zod union.
 * Better Auth's generator only reads plain objects and publishes an empty
 * schema for unions, so endpoints with union bodies pass this through
 * `metadata.openapi` instead.
 */
export function jsonRequestBody(schema: z.ZodType) {
	return {
		required: true,
		content: {
			"application/json": {
				schema: z.toJSONSchema(schema, {
					target: "openapi-3.0",
					io: "input",
					// Envelope schemas add `_raw` with a transform; it is not part of the wire format.
					unrepresentable: "any",
				}) as any,
			},
		},
	};
}
