import { S3Client, PutBucketCorsCommand } from '@aws-sdk/client-s3';
import { readFileSync } from 'fs';

// Load env from netlify.env
const envFile = readFileSync(new URL('../netlify.env', import.meta.url), 'utf-8');
const env = Object.fromEntries(
	envFile.split('\n').filter(l => l.includes('=')).map(l => l.split('=').map(s => s.trim()))
);

const s3 = new S3Client({
	region: 'auto',
	endpoint: `https://${env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
	credentials: {
		accessKeyId: env.CLOUDFLARE_R2_ACCESS_KEY_ID,
		secretAccessKey: env.CLOUDFLARE_R2_SECRET_ACCESS_KEY
	}
});

await s3.send(new PutBucketCorsCommand({
	Bucket: env.R2_BUCKET_NAME,
	CORSConfiguration: {
		CORSRules: [
			{
				AllowedOrigins: ['https://ws-uploader.netlify.app'],
				AllowedMethods: ['PUT'],
				AllowedHeaders: ['*'],
				MaxAgeSeconds: 3600
			}
		]
	}
}));

console.log('CORS set on bucket:', env.R2_BUCKET_NAME);
