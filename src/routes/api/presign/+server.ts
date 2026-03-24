import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

const R2_KEYS = {
	design: 'WS_Portfolio_2025.pdf',
	architecture: 'WSA_2026 v8.0.pdf'
} as const;

export const POST: RequestHandler = async ({ request }) => {
	const { type } = await request.json();

	if (!type || !['design', 'architecture'].includes(type)) {
		error(400, 'Invalid type');
	}

	const s3 = new S3Client({
		region: 'auto',
		endpoint: `https://${env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
		credentials: {
			accessKeyId: env.CLOUDFLARE_R2_ACCESS_KEY_ID,
			secretAccessKey: env.CLOUDFLARE_R2_SECRET_ACCESS_KEY
		}
	});

	const key = R2_KEYS[type as keyof typeof R2_KEYS];

	const uploadUrl = await getSignedUrl(
		s3,
		new PutObjectCommand({
			Bucket: env.R2_BUCKET_NAME,
			Key: key,
			ContentType: 'application/pdf'
		}),
		{ expiresIn: 300 }
	);

	return json({ uploadUrl, key });
};
