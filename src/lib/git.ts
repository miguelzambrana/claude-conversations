import { execSync } from 'node:child_process';
import type { GitInfo } from './types.ts';

function run(cmd: string, cwd: string): string | null {
  try {
    return execSync(cmd, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return null;
  }
}

export function getGitBranch(cwd: string): string | null {
  return run('git branch --show-current', cwd);
}

export function getRecentCommits(cwd: string, n = 20): string[] {
  const out = run(`git log --oneline -${n}`, cwd);
  if (!out) return [];
  return out.split('\n').filter(Boolean);
}

export function getGitStatus(cwd: string): string | null {
  return run('git status --short', cwd);
}

export function getGitInfo(cwd: string): GitInfo {
  if (!cwd) return { branch: null, commits: [], status: null };
  return {
    branch: getGitBranch(cwd),
    commits: getRecentCommits(cwd),
    status: getGitStatus(cwd),
  };
}
