import { auth } from "@/lib/auth"
import { expect, test } from "@playwright/test"

// NOTICE: Does not work, will fix it later

test("create and login user", async ({ context, page }) => {
	const ctx = await auth.$context
	const testUtils = ctx.test

	// Go to home page
	await page.goto("/")
	// Check if we are redirected to the auth page
	await expect(page).toHaveURL("/auth")

	// Create and save user
	const user = testUtils.createUser({
		email: "e2e@example.com",
		name: "E2E User"
	})
	await testUtils.saveUser(user)

	// Get cookies and inject into browser
	const cookies = await testUtils.getCookies({
		userId: user.id,
		domain: "localhost"
	})
	await context.addCookies(cookies)

	// Login
	await testUtils.login({ userId: user.id })
	// Check if we got redirected to the home page
	await expect(page).toHaveURL("/")

	// Check if we are logged in
	const headers = await testUtils.getAuthHeaders({ userId: user.id })
	expect(headers).toBeDefined()
	expect(headers.get("Authorization")).toBeDefined()

	// Delete user
	await testUtils.deleteUser(user.id)

	// Check if user is deleted
	const deletedUser = await ctx.internalAdapter.findUserById(user.id)
	expect(deletedUser).toBeNull()
})