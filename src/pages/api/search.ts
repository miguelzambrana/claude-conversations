import type { APIRoute } from 'astro';
import { searchSessions } from '../../lib/searchIndex.ts';

export const GET: APIRoute = async ({ url }) => {
  const q = url.searchParams.get('q')?.trim() ?? '';
  if (q.length < 2) return Response.json({ results: [] });

  const results = await searchSessions(q, 20);
  return Response.json({ results });
};
