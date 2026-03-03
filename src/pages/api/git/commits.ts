import type { APIRoute } from 'astro';
import { execSync } from 'node:child_process';
import { listProjectDirs } from '../../../lib/projects.ts';
import { join } from 'node:path';

export interface Commit {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  email: string;
  relativeTime: string;
  isoTime: string;
}

function safeExec(cmd: string, cwd: string): string | null {
  try {
    return execSync(cmd, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return null;
  }
}

function validatePath(path: string): boolean {
  const allowed = listProjectDirs().concat(
    // also allow actual cwd paths referenced in sessions
    ['/home', '/root', '/workspace', '/Users']
  );
  // Simple check: path must be absolute and non-empty
  return path.startsWith('/') && path.length > 1;
}

export const GET: APIRoute = async ({ url }) => {
  const path = url.searchParams.get('path');
  if (!path || !validatePath(path)) {
    return Response.json({ commits: [] });
  }

  const raw = safeExec(
    `git log --format="%H|%s|%an|%ae|%ar|%aI" -50`,
    path
  );

  if (!raw) return Response.json({ commits: [] });

  const commits: Commit[] = raw
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [hash, message, author, email, relativeTime, isoTime] = line.split('|');
      return {
        hash: hash ?? '',
        shortHash: (hash ?? '').slice(0, 7),
        message: message ?? '',
        author: author ?? '',
        email: email ?? '',
        relativeTime: relativeTime ?? '',
        isoTime: isoTime ?? '',
      };
    });

  return Response.json({ commits });
};
