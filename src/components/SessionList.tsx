import type { Session } from '../lib/types.ts';

interface Props {
  sessions: Session[];
}

function formatDate(d: Date | string): string {
  return new Date(d).toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function SessionList({ sessions }: Props) {
  if (sessions.length === 0) {
    return <p className="text-gray-500 text-sm">No sessions found.</p>;
  }

  return (
    <div className="divide-y divide-gray-800 rounded-md border border-gray-700 overflow-hidden">
      {sessions.map((session) => (
        <a
          key={session.id}
          href={`/sessions/${session.id}`}
          className="flex items-start gap-4 px-5 py-4 bg-[#161b22] hover:bg-[#1c2128] transition-colors group"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-blue-400 group-hover:underline truncate">
                {session.slug || session.id.slice(0, 8)}
              </span>
              {session.gitBranch && (
                <span className="flex items-center gap-1 text-xs text-gray-500 bg-gray-800 rounded px-1.5 py-0.5">
                  <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 16 16">
                    <path d="M11.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122V6A2.5 2.5 0 019 8.5H7a1 1 0 00-1 1v1.128a2.251 2.251 0 11-1.5 0V5.372a2.25 2.25 0 111.5 0v1.836A2.493 2.493 0 017 7h2a1 1 0 001-1v-.628A2.25 2.25 0 019.5 3.25zM4.25 12a.75.75 0 100 1.5.75.75 0 000-1.5zM3.5 3.25a.75.75 0 111.5 0 .75.75 0 01-1.5 0z" />
                  </svg>
                  {session.gitBranch}
                </span>
              )}
            </div>
            {session.firstMessage && (
              <p className="mt-1 text-sm text-gray-400 line-clamp-2">{session.firstMessage}</p>
            )}
          </div>
          <div className="flex-shrink-0 text-right">
            <p className="text-xs text-gray-500">{formatDate(session.timestamp)}</p>
            <p className="mt-1 text-xs text-gray-600">{session.messageCount} msgs</p>
          </div>
        </a>
      ))}
    </div>
  );
}
