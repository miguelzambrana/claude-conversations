import type { GitInfo } from '../lib/types.ts';

interface Props {
  git: GitInfo;
  cwd: string;
}

export default function GitPanel({ git, cwd }: Props) {
  if (!git.branch && git.commits.length === 0) {
    return (
      <div className="rounded-md border border-gray-700 bg-[#161b22] p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Repository</h3>
        <p className="text-xs text-gray-600">Not a git repository</p>
        <p className="text-xs text-gray-600 mt-1 truncate">{cwd}</p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-gray-700 bg-[#161b22] p-4 space-y-4">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Repository</h3>
        <p className="text-xs text-gray-400 truncate">{cwd}</p>
      </div>

      {git.branch && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Branch</h3>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-green-900 px-2.5 py-0.5 text-xs font-medium text-green-300">
            <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 16 16">
              <path d="M11.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122V6A2.5 2.5 0 019 8.5H7a1 1 0 00-1 1v1.128a2.251 2.251 0 11-1.5 0V5.372a2.25 2.25 0 111.5 0v1.836A2.493 2.493 0 017 7h2a1 1 0 001-1v-.628A2.25 2.25 0 019.5 3.25zM4.25 12a.75.75 0 100 1.5.75.75 0 000-1.5zM3.5 3.25a.75.75 0 111.5 0 .75.75 0 01-1.5 0z" />
            </svg>
            {git.branch}
          </span>
        </div>
      )}

      {git.status && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Status</h3>
          <pre className="text-xs text-gray-400 whitespace-pre-wrap break-all">{git.status}</pre>
        </div>
      )}

      {git.commits.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Recent Commits</h3>
          <div className="space-y-1">
            {git.commits.slice(0, 10).map((commit) => {
              const [hash, ...rest] = commit.split(' ');
              return (
                <div key={hash} className="flex gap-2 text-xs">
                  <span className="flex-shrink-0 font-mono text-blue-400">{hash}</span>
                  <span className="text-gray-400 truncate">{rest.join(' ')}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
