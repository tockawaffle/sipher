import minioClient from "@/lib/plugins/storage/server/minio.client";

/** Lifetime of the presigned URL a /media request redirects to. */
const MEDIA_URL_EXPIRY_SECONDS = 10 * 60;

/** Keys created by the upload endpoint: tmp/<userId>/<uuid>.<ext>. */
const MEDIA_KEY = /^tmp\/[A-Za-z0-9_-]+\/[0-9a-f-]{36}\.[a-z0-9]{2,4}$/;

/**
 * GET /media/<objectKey>. Redirects to a short-lived presigned MinIO URL, so
 * post attachments keep a stable URL that peers can fetch at any time.
 */
export async function GET(objectKey: string): Promise<Response> {
	if (!MEDIA_KEY.test(objectKey)) {
		return new Response("Not found", { status: 404 });
	}

	let url: string;
	try {
		url = await minioClient.presignedGetObject(
			process.env.MINIO_BUCKET!,
			objectKey,
			MEDIA_URL_EXPIRY_SECONDS,
		);
	} catch (err) {
		console.error("[media] presign failed:", err);
		return new Response("Storage unavailable", { status: 502 });
	}

	return new Response(null, {
		status: 302,
		headers: {
			Location: url,
			// Cache the redirect for less time than the URL it points to lives.
			"Cache-Control": `public, max-age=${MEDIA_URL_EXPIRY_SECONDS / 2}`,
		},
	});
}
