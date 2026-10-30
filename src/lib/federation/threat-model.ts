import type { FederationErrorCode } from "./fetch";

export interface ThreatPolicy {
	proxyEligible: boolean;
	description: string;
}

/**
 * From the sender's side a censor and an outage look alike: a censor can
 * poison DNS, drop packets (TIMEOUT) or inject resets (CONN_REFUSED /
 * CONN_RESET). So every network failure that a peer on another path could
 * route around is proxy-eligible. When the target really is down, the proxy
 * answers 502 and the BullMQ retries take over, so the cost is one extra
 * request per attempt.
 */
export const DEFAULT_THREAT_MODEL: Record<FederationErrorCode, ThreatPolicy> = {
	DNS_BLOCKED: {
		proxyEligible: true,
		description: "DNS unreachable -- likely censored, relay-eligible",
	},
	TIMEOUT: {
		proxyEligible: true,
		description: "Timed out -- packets may be dropped by a censor, relay-eligible",
	},
	CONN_REFUSED: {
		proxyEligible: true,
		description: "Connection refused -- server down or reset injected by a censor, relay-eligible",
	},
	CONN_RESET: {
		proxyEligible: true,
		description: "Connection reset -- possible reset injection, relay-eligible",
	},
	TLS_ERROR: {
		proxyEligible: false,
		description: "TLS failure -- possible MITM, do not proxy",
	},
	INVALID_RESPONSE_FROM_TARGET: {
		proxyEligible: true,
		description: "Invalid response from target -- relay-eligible but you should check the data you're trying to relay, it might be invalid.",
	},
	UNKNOWN: {
		proxyEligible: true,
		description: "Unknown error -- safety default",
	},
};

export const EMERGENCY_SWEEP_TIMEOUT = 2_000;

/**
 * Admin overrides -- edit this to match your federation's threat model.
 * Any key you set here overrides the corresponding default above.
 *
 * Example for a network where proxying an outage is not worth the extra request:
 *   CONN_REFUSED: { proxyEligible: false },
 */
export const THREAT_MODEL_OVERRIDES: Partial<Record<FederationErrorCode, Partial<ThreatPolicy>>> = {};

export function getThreatPolicy(code: FederationErrorCode): ThreatPolicy {
	const base = DEFAULT_THREAT_MODEL[code];
	const override = THREAT_MODEL_OVERRIDES[code];
	return override ? { ...base, ...override } : base;
}
