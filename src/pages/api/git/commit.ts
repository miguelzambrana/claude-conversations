import type { APIRoute } from 'astro';
import { execSync } from 'node:child_process';

export interface CommitFile {
  path: string;
  added: number;
  removed: number;
  status: 'modified' | 'added' | 'deleted' | 'renamed';
}

function safeExec(cmd: string, cwd: string): string | null {
  try {
    return execSync(cmd, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return null;
  }
}

export const GET: APIRoute = async ({ url }) => {
  const path = url.searchParams.get('path');
  const hash = url.searchParams.get('hash');

  if (!path || !hash || !/^[0-9a-f]{7,40}$/.test(hash)) {
    return Response.json({ files: [] });
  }

  // Use --numstat for exact +/- counts, and --name-status for file status
  const numstat = safeExec(`git show --numstat --format="" ${hash}`, path);
  const nameStatus = safeExec(`git show --name-status --format="" ${hash}`, path);

  if (!numstat) return Response.json({ files: [] });

  const statusMap = new Map<string, string>();
  if (nameStatus) {
    for (const line of nameStatus.split('\n').filter(Boolean)) {
      const parts = line.split('\t');
      if (parts.length >= 2) {
        const status = parts[0][0]; // A, M, D, R
        const filePath = parts[parts.length - 1]; // handle renames
        statusMap.set(filePath, status);
      }
    }
  }

  const files: CommitFile[] = numstat
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const parts = line.split('\t');
      if (parts.length < 3) return null;
      const added = parseInt(parts[0]) || 0;
      const removed = parseInt(parts[1]) || 0;
      const filePath = parts[2];
      const rawStatus = statusMap.get(filePath) ?? 'M';
      const status: CommitFile['status'] =
        rawStatus === 'A' ? 'added'
        : rawStatus === 'D' ? 'deleted'
        : rawStatus === 'R' ? 'renamed'
        : 'modified';
      return { path: filePath, added, removed, status };
    })
    .filter((f): f is CommitFile => f !== null);

  return Response.json({ files });
};
