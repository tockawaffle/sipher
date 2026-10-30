import { discoverAndRegister, DiscoveryError } from "@/lib/federation/registry";
import { assertSafeUrl, UrlGuardError } from "@/lib/federation/url-guard";
import createDebug from "debug";
import { z } from "zod";

const debug = createDebug("app:api:dev:relay-discover");

const bodySchema = z.object({
	target: z.url(),
});

/**
 * Dev-only: browser calls same origin; server runs the full mutual-registration
 * flow (GET keys → register locally → POST REGISTER → process echo) so that
 * both sides end up knowing each other, mirroring the production path.
 */
export async function POST(request: Request) {
	if (process.env.NODE_ENV === "production") {
		return Response.json({ error: "Not found" }, { status: 404 });
	}

	let json: unknown;
	try {
		json = await request.json();
	} catch {
		return Response.json({ error: "Invalid JSON" }, { status: 400 });
	}

	const parsed = bodySchema.safeParse(json);
	if (!parsed.success) {
		return Response.json({ error: parsed.error.message }, { status: 400 });
	}

	const { target } = parsed.data;
	try {
		assertSafeUrl(target);
	} catch (err) {
		if (err instanceof UrlGuardError) {
			return Response.json({ error: err.message }, { status: 400 });
		}
		throw err;
	}

	try {
		await discoverAndRegister(target);
		debug("relay-discover: mutual registration with %s complete", target);
		return Response.json({ message: "Server registered successfully" });
	} catch (err) {
		debug("relay-discover failed: %o", err);
		if (err instanceof DiscoveryError) {
			return Response.json({ error: err.message }, { status: 502 });
		}
		throw err;
	}
}
