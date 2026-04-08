import db from '@/lib/db';
import { deliveryJobs, follows, serverRegistry } from '@/lib/db/schema';
import { verifySignature } from '@/lib/federation/keytools';
import { FollowEnvelopeSchema } from '@/lib/zod/methods/FollowSchema';
import { UnrecoverableError } from 'bullmq';
import createDebug from 'debug';
import { and, eq } from 'drizzle-orm';

const debug = createDebug('app:federation:worker');

interface AckPayload {
	method: 'PROXY_RESPONSE';
	data: unknown;
	signature: string;
}

/**
 * Resolves the signing public key for a server. If the server was not in the
 * registry at delivery time (auto-discovered), we re-fetch it now that
 * discoverAndRegister has run and inserted the row.
 */
async function resolveServerPublicKey(
	serverUrl: string,
	cachedPublicKey: string | undefined,
): Promise<string> {
	if (cachedPublicKey) return cachedPublicKey;

	const [fresh] = await db
		.select({ publicKey: serverRegistry.publicKey })
		.from(serverRegistry)
		.where(eq(serverRegistry.url, serverUrl))
		.limit(1);

	if (!fresh?.publicKey) {
		throw new UnrecoverableError(
			`Cannot verify follow ack from ${serverUrl}: server has no signing public key in registry`,
		);
	}

	return fresh.publicKey;
}

export async function handleFollowAck(
	ackPayload: AckPayload,
	serverUrl: string,
	cachedServerPublicKey: string | undefined,
	deliveryJobId: string,
	jobId: string | undefined,
): Promise<void> {
	debug('handling follow ack from %s', serverUrl);
	debug('ackPayload: %o', ackPayload);

	const decrypted = FollowEnvelopeSchema.safeParse(ackPayload.data);
	if (!decrypted.success) {
		debug('failed to parse follow payload: %s', ackPayload.data);
		await db.delete(deliveryJobs).where(eq(deliveryJobs.id, deliveryJobId));
		throw new UnrecoverableError(`Failed to parse follow payload, dropping job ${jobId}`);
	}

	debug('payload data: %o', decrypted.data);

	const publicKey = await resolveServerPublicKey(serverUrl, cachedServerPublicKey);
	const signatureValid = verifySignature(
		decrypted.data._raw,
		ackPayload.signature,
		new Uint8Array(Buffer.from(publicKey, 'base64')),
	);

	if (!signatureValid) {
		debug('signature verification failed, dropping job %s', jobId);
		await db.delete(deliveryJobs).where(eq(deliveryJobs.id, deliveryJobId));
		throw new UnrecoverableError(`Signature verification failed, dropping job ${jobId}`);
	}

	const followData = decrypted.data.following;


	// Verify the row exists locally before applying the remote's accepted flag.
	const [existing] = await db
		.select({ id: follows.id })
		.from(follows)
		.where(
			and(
				eq(follows.followerId, followData.followerId),
				eq(follows.followingId, followData.followingId),
				eq(follows.followerServerUrl, serverUrl),
			),
		)
		.limit(1);

	if (!existing) {
		debug(
			'follow ack references unknown follow (%s → %s from %s), ignoring',
			followData.followerId,
			followData.followingId,
			serverUrl,
		);
		return;
	}

	if (!followData?.accepted) {
		debug('follow %s is not accepted but was acknowledged, setting acknowledged to true', followData.id);
		await db.update(follows).set({ acknowledged: true }).where(
			and(
				eq(follows.followerId, followData.followerId),
				eq(follows.followingId, followData.followingId),
				eq(follows.followerServerUrl, serverUrl),
			),
		);
		debug('follow %s acknowledged', existing.id);
		return;
	}

	await db
		.update(follows)
		.set({ accepted: followData.accepted })
		.where(
			and(
				eq(follows.followerId, followData.followerId),
				eq(follows.followingId, followData.followingId),
				eq(follows.followerServerUrl, serverUrl),
			),
		);

	debug('updated follow %s accepted=%s', followData.id, followData.accepted);
}
