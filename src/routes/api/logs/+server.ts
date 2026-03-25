import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readFileSync } from 'fs';
import { join } from 'path';

export const GET: RequestHandler = () => {
	try {
		const logs = JSON.parse(readFileSync(join(process.cwd(), 'data', 'uploads.json'), 'utf-8'));
		return json(logs);
	} catch {
		return json([]);
	}
};
