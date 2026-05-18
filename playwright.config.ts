import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env.local') });

export default defineConfig({
	testDir: './tests',
	/** Bun discovers `*.test.ts` / `*.spec.ts` as Bun tests; keep HTTP suites under `*.e2e.ts`. */
	testMatch: '**/*.e2e.ts',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: 1,
	reporter: 'html',
	use: {
		baseURL: 'http://localhost:3000',
		trace: 'on-first-retry',
	},
	webServer: {
		command: 'cross-env NODE_ENV=test tsx src/server.ts',
		url: process.env.BETTER_AUTH_URL,
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] },
		},
	],
});
