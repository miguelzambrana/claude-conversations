import { useState, useCallback, useRef } from 'react';
import type { SearchResult } from '../lib/types.ts';

export default function SearchBar() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback((q: string) => {
    if (timer.current) clearTimeout(timer.current);
    if (q.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const data = await res.json() as { results: SearchResult[] };
        setResults(data.results);
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
  }, []);

  return (
    <div className="relative w-full max-w-xl">
      <div className="relative">
        <input
          type="search"
          placeholder="Search conversations…"
          className="w-full rounded-md border border-gray-600 bg-[#1c2128] px-4 py-2 pl-10 text-sm text-gray-200 placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            search(e.target.value);
          }}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          onFocus={() => results.length > 0 && setOpen(true)}
        />
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
          {loading ? (
            <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          )}
        </span>
      </div>

      {open && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 max-h-96 overflow-y-auto rounded-md border border-gray-700 bg-[#161b22] shadow-lg">
          {results.map((r) => (
            <a
              key={`${r.sessionId}-${r.messageUuid}`}
              href={`/sessions/${r.sessionId}#${r.messageUuid}`}
              className="block px-4 py-3 hover:bg-[#1c2128] border-b border-gray-800 last:border-0"
            >
              <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
                <span className="text-blue-400 font-medium">{r.projectName}</span>
                <span>›</span>
                <span>{r.sessionSlug}</span>
                <span className="ml-auto">{new Date(r.timestamp).toLocaleDateString()}</span>
              </div>
              <p className="text-sm text-gray-200 line-clamp-2">{r.excerpt}</p>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
