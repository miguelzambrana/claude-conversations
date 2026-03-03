import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { basename } from 'node:path';
import { listProjectDirs, listSessionFiles, projectIdFromDir } from './projects.ts';
import type { RawMessage, ContentBlock, SearchResult } from './types.ts';

// ─── In-memory index ──────────────────────────────────────────────────────────

interface IndexEntry {
  sessionId:   string;
  projectId:   string;
  projectName: string;
  sessionSlug: string;
  messageUuid: string;
  text:        string;
  timestamp:   number;
}

const SKIP_TYPES = new Set(['progress', 'file-history-snapshot', 'system']);
const INDEX_TTL  = 10 * 60 * 1000; // 10 minutes

let _index:   IndexEntry[] | null = null;
let _builtAt: number = 0;

export async function searchSessions(query: string, limit = 20): Promise<SearchResult[]> {
  if (!_index || Date.now() - _builtAt > INDEX_TTL) {
    _index   = await buildIndex();
    _builtAt = Date.now();
  }

  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];

  const results: SearchResult[] = [];
  for (const entry of _index) {
    if (!entry.text.toLowerCase().includes(q)) continue;

    const idx   = entry.text.toLowerCase().indexOf(q);
    const start = Math.max(0, idx - 60);
    const end   = Math.min(entry.text.length, idx + q.length + 60);
    const excerpt =
      (start > 0 ? '…' : '') + entry.text.slice(start, end) + (end < entry.text.length ? '…' : '');

    results.push({
      projectId:   entry.projectId,
      projectName: entry.projectName,
      sessionId:   entry.sessionId,
      sessionSlug: entry.sessionSlug,
      messageUuid: entry.messageUuid,
      excerpt,
      timestamp: new Date(entry.timestamp),
    });

    if (results.length >= limit) break;
  }
  return results;
}

export function invalidateIndex() {
  _index   = null;
  _builtAt = 0;
}

// ─── Build ────────────────────────────────────────────────────────────────────

async function buildIndex(): Promise<IndexEntry[]> {
  const entries: IndexEntry[] = [];

  for (const projectDir of listProjectDirs()) {
    const projectId   = projectIdFromDir(projectDir);
    const projectName = projectId.split('-').filter(Boolean).pop() ?? projectId;

    for (const sf of listSessionFiles(projectDir)) {
      const sessionId = basename(sf, '.jsonl');
      let sessionSlug = sessionId.slice(0, 8);

      try {
        const rl = createInterface({ input: createReadStream(sf, { encoding: 'utf8' }), crlfDelay: Infinity });
        for await (const line of rl) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          let raw: RawMessage;
          try { raw = JSON.parse(trimmed) as RawMessage; } catch { continue; }

          if (SKIP_TYPES.has(raw.type) || (raw.type !== 'user' && raw.type !== 'assistant') || !raw.message) continue;
          if (raw.slug) sessionSlug = raw.slug;

          const text = extractText(raw.message.content);
          if (text.length < 3) continue;

          entries.push({
            sessionId,
            projectId,
            projectName,
            sessionSlug,
            messageUuid: raw.uuid,
            text: text.slice(0, 1000), // cap per-message text
            timestamp: new Date(raw.timestamp).getTime(),
          });
        }
      } catch { /* skip unreadable */ }
    }
  }

  return entries;
}

function extractText(content: ContentBlock[] | string): string {
  if (typeof content === 'string') return content;
  const parts: string[] = [];
  for (const b of content) {
    if (b.type === 'text') parts.push(b.text);
    else if (b.type === 'tool_use') {
      for (const v of Object.values(b.input)) {
        if (typeof v === 'string') parts.push(v);
      }
    }
  }
  return parts.join(' ');
}
