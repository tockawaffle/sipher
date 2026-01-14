const fs = require('fs');
const path = require('path');

// Load .env.local if it exists
function loadEnvFile(filename) {
	const envPath = path.resolve(__dirname, filename);
	if (!fs.existsSync(envPath)) return {};

	const content = fs.readFileSync(envPath, 'utf-8');
	const env = {};
	for (const line of content.split('\n')) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;
		const [key, ...rest] = trimmed.split('=');
		if (key) env[key.trim()] = rest.join('=').trim().replace(/^["']|["']$/g, '');
	}
	return env;
}

const envLocal = loadEnvFile('.env.local');

module.exports = {
	apps: [
		{
			name: 'sipher',
			script: 'src/server.ts',
			interpreter: 'node_modules/.bin/tsx',
			instances: 1,
			exec_mode: 'fork',
			watch: false,
			max_memory_restart: '4G',
			env: {
				...envLocal,
				NODE_ENV: 'development',
				PORT: 3000,
			},
			env_production: {
				...envLocal,
				NODE_ENV: 'production',
				PORT: 8081,
			},
		},
	],
};
