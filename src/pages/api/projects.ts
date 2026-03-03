import type { APIRoute } from 'astro';
import { getProjects } from '../../lib/projects.ts';

export const GET: APIRoute = async () => {
  const projects = await getProjects();
  return Response.json(projects);
};
