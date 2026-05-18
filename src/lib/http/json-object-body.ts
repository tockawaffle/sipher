/** True when JSON.parse-style output is a non-array record (expected root shape for POST JSON APIs). */
export function isJsonObjectBody(body: unknown): body is Record<string, unknown> {
	return body !== null && typeof body === "object" && !Array.isArray(body);
}
