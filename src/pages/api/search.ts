import type { APIRoute } from 'astro';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { basename } from 'node:path';
import { listProjectDirs, listSessionFiles, projectIdFromDir } from '../../lib/projects.ts';
import type { RawMessage, ContentBlock, SearchResult } from '../../lib/types.ts';

const SKIP_TYPES = new Set(['progress', 'file-history-snapshot', 'system']);

export const GET: APIRoute = async ({ url }) => {
  const q = url.searchParams.get('q')?.trim().toLowerCase();
  if (!q || q.length < 2) return Response.json({ results: [] });

  const results: SearchResult[] = [];
  const projectDirs = listProjectDirs();

  for (const projectDir of projectDirs) {
    const projectId = projectIdFromDir(projectDir);
    const sessionFiles = listSessionFiles(projectDir);

    for (const sf of sessionFiles) {
      const sessionId = basename(sf, '.jsonl');
      let sessionSlug = sessionId;
      let projectName = projectId.split('-').filter(Boolean).pop() ?? projectId;

      try {
        const rl = createInterface({
          input: createReadStream(sf, { encoding: 'utf8' }),
          crlfDelay: Infinity,
        });

        for await (const line of rl) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          let raw: RawMessage;
          try {
            raw = JSON.parse(trimmed) as RawMessage;
          } catch {
            continue;
          }

          if (SKIP_TYPES.has(raw.type)) continue;
          if (raw.type !== 'user' && raw.type !== 'assistant') continue;
          if (!raw.message) continue;

          if (raw.slug) sessionSlug = raw.slug;

          const text = extractSearchableText(raw.message.content);
          if (text.toLowerCase().includes(q)) {
            const idx = text.toLowerCase().indexOf(q);
            const start = Math.max(0, idx - 60);
            const end = Math.min(text.length, idx + q.length + 60);
            const excerpt = (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');

            results.push({
              projectId,
              projectName,
              sessionId,
              sessionSlug,
              messageUuid: raw.uuid,
              excerpt,
              timestamp: new Date(raw.timestamp),
            });

            if (results.length >= 20) break;
          }
        }
      } catch {
        continue;
      }

      if (results.length >= 20) break;
    }

    if (results.length >= 20) break;
  }

  return Response.json({ results });
};

function extractSearchableText(content: ContentBlock[] | string): string {
  if (typeof content === 'string') return content;
  const parts: string[] = [];
  for (const block of content) {
    if (block.type === 'text') parts.push(block.text);
    else if (block.type === 'tool_use') {
      const input = block.input;
      if (typeof input === 'object' && input !== null) {
        for (const val of Object.values(input)) {
          if (typeof val === 'string') parts.push(val);
        }
      }
    }
    // Skip thinking blocks
  }
  return parts.join(' ');
}
