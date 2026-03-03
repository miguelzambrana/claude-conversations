import type { APIRoute } from 'astro';
import { findSessionFile } from '../../../lib/projects.ts';
import { parseSession, getSessionMetadata } from '../../../lib/parser.ts';

export const GET: APIRoute = async ({ params }) => {
  const { id } = params;
  if (!id) return new Response('Missing id', { status: 400 });

  const filePath = findSessionFile(id);
  if (!filePath) return new Response('Session not found', { status: 404 });

  const [messages, meta] = await Promise.all([
    parseSession(filePath),
    getSessionMetadata(filePath),
  ]);

  const session = {
    id,
    projectId: '',
    slug: meta.slug,
    firstMessage: meta.firstMessage,
    timestamp: meta.timestamp,
    gitBranch: meta.gitBranch,
    messageCount: meta.messageCount,
    cwd: meta.cwd,
  };

  return Response.json({ session, messages });
};
