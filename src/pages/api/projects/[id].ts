import type { APIRoute } from 'astro';
import { join } from 'node:path';
import { getProjectsDir, getProjectSessions, listSessionFiles, deriveProjectName, projectIdFromDir } from '../../../lib/projects.ts';
import { getSessionMetadata } from '../../../lib/parser.ts';
import { getGitInfo } from '../../../lib/git.ts';

export const GET: APIRoute = async ({ params }) => {
  const { id } = params;
  if (!id) return new Response('Missing id', { status: 400 });

  const projectDir = join(getProjectsDir(), id);
  const sessions = await getProjectSessions(id);

  // Derive project metadata from first session
  const sessionFiles = listSessionFiles(projectDir);
  let cwd = '';
  if (sessionFiles.length > 0) {
    try {
      const meta = await getSessionMetadata(sessionFiles[0]);
      cwd = meta.cwd;
    } catch {
      // ignore
    }
  }

  const name = deriveProjectName(cwd, id);
  const git = getGitInfo(cwd);
  const lastActivity = sessions[0]?.timestamp ?? new Date(0);

  return Response.json({
    project: {
      id,
      name,
      path: cwd || projectDir,
      sessionCount: sessions.length,
      lastActivity,
      topTools: [],
    },
    sessions,
    git,
  });
};
