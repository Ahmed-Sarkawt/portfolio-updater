import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

const R2_KEYS = {
	design: 'WS_Portfolio_2025.pdf',
	architecture: 'WSA_2026 v8.0.pdf'
} as const;

const GITHUB_PATCHES: Record<string, { path: string; pattern: RegExp }[]> = {
	design: [
		{ path: 'src/shared/header.svelte', pattern: /https:\/\/pub-[^"']+\/WS_Portfolio[^"']*/g },
		{ path: 'src/routes/+page.svelte', pattern: /https:\/\/pub-[^"']+\/WS_Portfolio[^"']*/g }
	],
	architecture: [
		{ path: 'src/shared/header.svelte', pattern: /https:\/\/pub-[^"']+\/WSA_[^"']*/g }
	]
};

async function getFile(repo: string, filePath: string) {
	const res = await fetch(`https://api.github.com/repos/${repo}/contents/${filePath}`, {
		headers: {
			Authorization: `Bearer ${env.GITHUB_TOKEN}`,
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

async function updateFile(repo: string, filePath: string, newContent: string, sha: string, message: string) {
	const res = await fetch(`https://api.github.com/repos/${repo}/contents/${filePath}`, {
		method: 'PUT',
		headers: {
			Authorization: `Bearer ${env.GITHUB_TOKEN}`,
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
	const { type } = await request.json();

	if (!type || !['design', 'architecture'].includes(type)) {
		error(400, 'Invalid type');
	}

	const key = R2_KEYS[type as keyof typeof R2_KEYS];
	const newUrl = `${env.R2_PUBLIC_BASE_URL}/${encodeURIComponent(key)}`;
	const patches = GITHUB_PATCHES[type];
	const uniquePaths = [...new Set(patches.map((p) => p.path))];

	for (const filePath of uniquePaths) {
		const { content, sha } = await getFile(env.GITHUB_REPO, filePath);
		const filePatches = patches.filter((p) => p.path === filePath);
		let updated = content;
		for (const patch of filePatches) {
			updated = updated.replace(patch.pattern, newUrl);
		}
		if (updated !== content) {
			await updateFile(env.GITHUB_REPO, filePath, updated, sha, `chore: update ${type} portfolio PDF link`);
		}
	}

	return json({ ok: true, url: newUrl });
};
