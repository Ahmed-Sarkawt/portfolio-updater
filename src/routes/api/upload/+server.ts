import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

const {
	CLOUDFLARE_ACCOUNT_ID,
	CLOUDFLARE_R2_ACCESS_KEY_ID,
	CLOUDFLARE_R2_SECRET_ACCESS_KEY,
	R2_BUCKET_NAME,
	R2_PUBLIC_BASE_URL,
	GITHUB_TOKEN,
	GITHUB_REPO
} = env;

// File names in R2
const R2_KEYS = {
	design: 'WS_Portfolio_2025.pdf',
	architecture: 'WSA_2026 v8.0.pdf'
} as const;

// Locations to patch in ws-website source
const GITHUB_PATCHES: Record<string, { path: string; pattern: RegExp; replacement: (url: string) => string }[]> = {
	design: [
		{
			path: 'src/shared/header.svelte',
			pattern: /https:\/\/pub-[^"']+\/WS_Portfolio[^"']*/g,
			replacement: (url) => url
		},
		{
			path: 'src/routes/+page.svelte',
			pattern: /https:\/\/pub-[^"']+\/WS_Portfolio[^"']*/g,
			replacement: (url) => url
		}
	],
	architecture: [
		{
			path: 'src/shared/header.svelte',
			pattern: /https:\/\/pub-[^"']+\/WSA_[^"']*/g,
			replacement: (url) => url
		}
	]
};

async function getFileFromGitHub(token: string, repo: string, filePath: string) {
	const res = await fetch(`https://api.github.com/repos/${repo}/contents/${filePath}`, {
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/vnd.github+json'
		}
	});
	if (!res.ok) throw new Error(`GitHub GET ${filePath}: ${res.status}`);
	const data = await res.json();
	return {
		content: Buffer.from(data.content, 'base64').toString('utf-8'),
		sha: data.sha as string
	};
}

async function updateFileOnGitHub(
	token: string,
	repo: string,
	filePath: string,
	newContent: string,
	sha: string,
	message: string
) {
	const res = await fetch(`https://api.github.com/repos/${repo}/contents/${filePath}`, {
		method: 'PUT',
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/vnd.github+json',
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			message,
			content: Buffer.from(newContent).toString('base64'),
			sha
		})
	});
	if (!res.ok) {
		const body = await res.text();
		throw new Error(`GitHub PUT ${filePath}: ${res.status} — ${body}`);
	}
}

export const POST: RequestHandler = async ({ request }) => {
	const formData = await request.formData();
	const file = formData.get('file') as File | null;
	const type = formData.get('type') as 'design' | 'architecture' | null;

	if (!file || !type || !['design', 'architecture'].includes(type)) {
		error(400, 'Missing file or invalid type');
	}

	// 1. Upload to R2
	const s3 = new S3Client({
		region: 'auto',
		endpoint: `https://${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
		credentials: {
			accessKeyId: CLOUDFLARE_R2_ACCESS_KEY_ID,
			secretAccessKey: CLOUDFLARE_R2_SECRET_ACCESS_KEY
		}
	});

	const key = R2_KEYS[type];
	const bytes = await file.arrayBuffer();

	await s3.send(
		new PutObjectCommand({
			Bucket: R2_BUCKET_NAME,
			Key: key,
			Body: Buffer.from(bytes),
			ContentType: 'application/pdf'
		})
	);

	const newUrl = `${R2_PUBLIC_BASE_URL}/${encodeURIComponent(key)}`;

	// 2. Patch ws-website source files via GitHub API
	const patches = GITHUB_PATCHES[type];
	// Collect unique file paths
	const uniquePaths = [...new Set(patches.map((p) => p.path))];

	for (const filePath of uniquePaths) {
		const { content, sha } = await getFileFromGitHub(GITHUB_TOKEN, GITHUB_REPO, filePath);
		const filePatches = patches.filter((p) => p.path === filePath);
		let updated = content;
		for (const patch of filePatches) {
			updated = updated.replace(patch.pattern, newUrl);
		}
		if (updated !== content) {
			await updateFileOnGitHub(
				GITHUB_TOKEN,
				GITHUB_REPO,
				filePath,
				updated,
				sha,
				`chore: update ${type} portfolio PDF link`
			);
		}
	}

	return json({ ok: true, url: newUrl });
};
