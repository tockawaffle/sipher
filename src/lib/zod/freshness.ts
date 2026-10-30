import { z } from "zod";

/** How old a federated message may be when it arrives. */
export const MAX_MESSAGE_AGE_MS = 15 * 60 * 1000;
/** How far ahead of our clock a sender's clock may run. */
export const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

/**
 * `sentAt` stamped by the sender on every delivery attempt and covered by
 * the server signature. Rejecting stale messages bounds replays to this
 * window; inside it, the handlers are idempotent, so a replay changes nothing.
 */
export const sentAtSchema = z.iso.datetime().refine((value) => {
	const age = Date.now() - Date.parse(value);
	return age <= MAX_MESSAGE_AGE_MS && age >= -MAX_CLOCK_SKEW_MS;
}, { message: "Message is too old or from the future (sentAt outside the accepted window)" });
