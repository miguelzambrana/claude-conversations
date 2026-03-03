import type { APIRoute } from 'astro';
import { execSync } from 'node:child_process';

function safeExec(cmd: string, cwd: string): string {
  try {
    return execSync(cmd, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  } catch {
    return '';
  }
}

export const GET: APIRoute = async ({ url }) => {
  const path = url.searchParams.get('path');
  const hash = url.searchParams.get('hash');
  const file = url.searchParams.get('file');

  if (!path || !hash || !file || !/^[0-9a-f]{7,40}$/.test(hash)) {
    return Response.json({ old: '', new: '' });
  }

  // Fetch old (parent) and new (current) content
  const oldContent = safeExec(`git show ${hash}^:${file}`, path);
  const newContent = safeExec(`git show ${hash}:${file}`, path);

  return Response.json({ old: oldContent, new: newContent });
};
