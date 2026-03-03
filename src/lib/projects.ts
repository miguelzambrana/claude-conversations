import { readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';
import { getSessionMetadata, extractTopTools } from './parser.ts';
import type { Project, Session } from './types.ts';

export function getProjectsDir(): string {
  return process.env.CLAUDE_PROJECTS_DIR ?? join(homedir(), '.claude', 'projects');
}

export function listProjectDirs(): string[] {
  const dir = getProjectsDir();
  return readdirSync(dir)
    .filter((name) => {
      try {
        return statSync(join(dir, name)).isDirectory();
      } catch {
        return false;
      }
    })
    .map((name) => join(dir, name));
}

export function listSessionFiles(projectDir: string): string[] {
  return readdirSync(projectDir)
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => join(projectDir, f));
}

export function projectIdFromDir(projectDir: string): string {
  return basename(projectDir);
}

export function deriveProjectName(cwd: string, dirName: string): string {
  if (cwd) {
    const parts = cwd.split('/').filter(Boolean);
    return parts[parts.length - 1] ?? dirName;
  }
  // Convert dir name like -home-miki-workspace-adminapi → adminapi
  return dirName.split('-').filter(Boolean).pop() ?? dirName;
}

export async function getProjects(): Promise<Project[]> {
  const projectDirs = listProjectDirs();
  const projects: Project[] = [];

  for (const projectDir of projectDirs) {
    const sessionFiles = listSessionFiles(projectDir);
    if (sessionFiles.length === 0) continue;

    const id = projectIdFromDir(projectDir);
    let lastActivity = new Date(0);
    let cwd = '';
    let topTools: string[] = [];

    // Get metadata from first session to determine cwd / name
    try {
      const meta = await getSessionMetadata(sessionFiles[0]);
      cwd = meta.cwd;
    } catch {
      // ignore
    }

    // Find last activity across all sessions
    for (const sf of sessionFiles) {
      try {
        const stat = statSync(sf);
        if (stat.mtimeMs > lastActivity.getTime()) {
          lastActivity = stat.mtime;
        }
      } catch {
        // ignore
      }
    }

    // Top tools from most recently modified session
    const sorted = [...sessionFiles].sort((a, b) => {
      try {
        return statSync(b).mtimeMs - statSync(a).mtimeMs;
      } catch {
        return 0;
      }
    });
    try {
      topTools = await extractTopTools(sorted[0]);
    } catch {
      // ignore
    }

    const name = deriveProjectName(cwd, id);

    projects.push({
      id,
      name,
      path: cwd || projectDir,
      sessionCount: sessionFiles.length,
      lastActivity,
      topTools,
    });
  }

  return projects.sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime());
}

export async function getProjectSessions(projectId: string): Promise<Session[]> {
  const projectDir = join(getProjectsDir(), projectId);
  const sessionFiles = listSessionFiles(projectDir);
  const sessions: Session[] = [];

  for (const sf of sessionFiles) {
    const sessionId = basename(sf, '.jsonl');
    try {
      const meta = await getSessionMetadata(sf);
      sessions.push({
        id: sessionId,
        projectId,
        slug: meta.slug,
        firstMessage: meta.firstMessage,
        timestamp: meta.timestamp,
        gitBranch: meta.gitBranch,
        messageCount: meta.messageCount,
        cwd: meta.cwd,
      });
    } catch {
      // skip unreadable
    }
  }

  return sessions.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}

export function findSessionFile(sessionId: string): string | null {
  const projectsDir = getProjectsDir();
  const projectDirs = listProjectDirs();

  for (const projectDir of projectDirs) {
    const sessionFiles = listSessionFiles(projectDir);
    const match = sessionFiles.find((f) => basename(f, '.jsonl') === sessionId);
    if (match) return match;
  }
  return null;
}
