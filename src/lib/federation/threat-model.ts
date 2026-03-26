import type { FederationErrorCode } from "./fetch";

export interface ThreatPolicy {
	proxyEligible: boolean;
	directHealthCheckable: boolean;
	description: string;
}

export const DEFAULT_THREAT_MODEL: Record<FederationErrorCode, ThreatPolicy> = {
	DNS_BLOCKED: {
		proxyEligible: true,
		directHealthCheckable: false,
		description: "DNS unreachable -- likely censored, relay-eligible",
	},
	TIMEOUT: {
		proxyEligible: false,
		directHealthCheckable: true,
		description: "Timed out -- ambiguous, rely on existing BullMQ retries",
	},
	CONN_REFUSED: {
		proxyEligible: false,
		directHealthCheckable: true,
		description: "Connection refused -- server is down, proxy won't help",
	},
	CONN_RESET: {
		proxyEligible: false,
		directHealthCheckable: true,
		description: "Connection reset -- ambiguous, likely server-side",
	},
	TLS_ERROR: {
		proxyEligible: false,
		directHealthCheckable: true,
		description: "TLS failure -- possible MITM, do not proxy",
	},
	UNKNOWN: {
		proxyEligible: true,
		directHealthCheckable: true,
		description: "Unknown error -- safety default",
	},
};

export const EMERGENCY_SWEEP_TIMEOUT = 2_000;

/**
 * Admin overrides -- edit this to match your federation's threat model.
 * Any key you set here overrides the corresponding default above.
 *
 * Example for a heavily censored region:
 *   TIMEOUT: { proxyEligible: true },
 */
export const THREAT_MODEL_OVERRIDES: Partial<Record<FederationErrorCode, Partial<ThreatPolicy>>> = {};

export function getThreatPolicy(code: FederationErrorCode): ThreatPolicy {
	const base = DEFAULT_THREAT_MODEL[code];
	const override = THREAT_MODEL_OVERRIDES[code];
	return override ? { ...base, ...override } : base;
}
