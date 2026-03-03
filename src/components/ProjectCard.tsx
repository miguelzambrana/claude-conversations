import type { Project } from '../lib/types.ts';

interface Props {
  project: Project;
}

const TOOL_COLORS: Record<string, string> = {
  Read: 'bg-blue-900 text-blue-300',
  Edit: 'bg-yellow-900 text-yellow-300',
  Bash: 'bg-red-900 text-red-300',
  Write: 'bg-green-900 text-green-300',
  Grep: 'bg-gray-700 text-gray-300',
  Glob: 'bg-gray-700 text-gray-300',
  TaskCreate: 'bg-purple-900 text-purple-300',
  TaskUpdate: 'bg-purple-900 text-purple-300',
  Agent: 'bg-indigo-900 text-indigo-300',
};

function toolBadgeClass(tool: string): string {
  return TOOL_COLORS[tool] ?? 'bg-gray-700 text-gray-300';
}

function formatDate(d: Date | string): string {
  return new Date(d).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

export default function ProjectCard({ project }: Props) {
  return (
    <a
      href={`/projects/${encodeURIComponent(project.id)}`}
      className="block rounded-md border border-gray-700 bg-[#161b22] p-5 hover:border-blue-500 transition-colors group"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <svg className="h-4 w-4 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
          <h2 className="truncate font-semibold text-blue-400 group-hover:underline">
            {project.name}
          </h2>
        </div>
        <span className="flex-shrink-0 rounded-full border border-gray-600 px-2 py-0.5 text-xs text-gray-400">
          {project.sessionCount} {project.sessionCount === 1 ? 'session' : 'sessions'}
        </span>
      </div>

      <p className="mt-2 truncate text-xs text-gray-500">{project.path}</p>

      {project.topTools.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {project.topTools.map((tool) => (
            <span key={tool} className={`rounded px-1.5 py-0.5 text-xs font-medium ${toolBadgeClass(tool)}`}>
              {tool}
            </span>
          ))}
        </div>
      )}

      <p className="mt-3 text-xs text-gray-500">
        Last active {formatDate(project.lastActivity)}
      </p>
    </a>
  );
}
