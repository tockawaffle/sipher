export async function register() {
	if (process.env.NEXT_RUNTIME === 'nodejs') {
		const { startFederationWorker } = await import('./lib/bull');
		startFederationWorker();
	}
}
