import { expect, test } from "@playwright/test";
import createDebug from "debug";
import { clearServerRegistry, getServerByUrl, insertServerEcho, } from "./helpers/db";

const debug = createDebug("test:discover");

const url = "http://172.21.157.201:3001";
const serverUrl = process.env.BETTER_AUTH_URL!;
if (!serverUrl) {
	throw new Error("BETTER_AUTH_URL is not set");
}

test.beforeEach(async () => {
	await clearServerRegistry()
})
test.afterEach(async () => {
	await clearServerRegistry()
})

test("discover server", async ({ request, page }) => {
	const response = await request.post(`${serverUrl}/discover`, {
		data: {
			method: "REGISTER",
			url: new URL(url).toString(),
			publicKey: process.env.FEDERATION_PUBLIC_KEY!,
			encryptionPublicKey: process.env.FEDERATION_ENCRYPTION_PUBLIC_KEY!,
		}
	})
	const status = response.status()
	const body = await response.json();
	debug("response status: %o", status);
	debug("response body: %o", body);
	expect(status).toBe(200)
	expect(body).toMatchObject({ message: "Server registered successfully" })
	expect(body.echo).toBeInstanceOf(Object)

	await insertServerEcho(
		serverUrl,
		body.echo.publicKey as string,
		body.echo.encryptionPublicKey as string,
	);

	const server = await getServerByUrl(serverUrl);
	expect(server).toBeDefined()
	expect(server?.publicKey).toBe(body.echo.publicKey as string)
});
