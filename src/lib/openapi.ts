import { auth } from './auth'

// Better Auth serves its routes under its default basePath.
const AUTH_PREFIX = '/api/auth'

/**
 * Better Auth's OpenAPI schema (from its `openAPI()` plugin), with paths
 * prefixed and tagged so `/openapi` lists the auth routes next to the
 * federation routes.
 */
async function betterAuthDocumentation() {
	const { paths, components } = await auth.api.generateOpenAPISchema()
	const prefixed: typeof paths = Object.create(null)
	for (const [path, item] of Object.entries(paths)) {
		for (const operation of Object.values(item) as { tags?: string[] }[]) {
			operation.tags = ['Better Auth']
		}
		prefixed[AUTH_PREFIX + path] = item
	}
	// Better Auth's OpenAPI types are looser than the ones @elysiajs/openapi
	// expects (optional parameter names), so hand them over untyped.
	return { paths: prefixed as any, components: components as any }
}

export const authDocumentation = await betterAuthDocumentation()
