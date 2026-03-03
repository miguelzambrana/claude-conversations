import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import type { Message, RawMessage, ContentBlock } from './types.ts';

const SKIP_TYPES = new Set(['progress', 'file-history-snapshot', 'system']);

export async function parseSession(filePath: string): Promise<Message[]> {
  const messages: Message[] = [];

  const rl = createInterface({
    input: createReadStream(filePath, { encoding: 'utf8' }),
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

    const content = normalizeContent(raw.message.content);
    const rawUsage = raw.message.usage;

    messages.push({
      uuid: raw.uuid,
      parentUuid: raw.parentUuid,
      role: raw.message.role,
      content,
      timestamp: new Date(raw.timestamp),
      cwd: raw.cwd ?? '',
      gitBranch: raw.gitBranch ?? '',
      isSidechain: raw.isSidechain ?? false,
      model: raw.message.model,
      usage: rawUsage
        ? {
            input_tokens: rawUsage.input_tokens ?? 0,
            output_tokens: rawUsage.output_tokens ?? 0,
            cache_creation_input_tokens: rawUsage.cache_creation_input_tokens ?? 0,
            cache_read_input_tokens: rawUsage.cache_read_input_tokens ?? 0,
          }
        : undefined,
    });
  }

  return messages;
}

function normalizeContent(content: ContentBlock[] | string): ContentBlock[] {
  if (typeof content === 'string') {
    return [{ type: 'text', text: content }];
  }
  return content;
}

export async function getSessionMetadata(filePath: string): Promise<{
  firstMessage: string;
  timestamp: Date;
  gitBranch: string;
  cwd: string;
  messageCount: number;
  slug: string;
}> {
  let firstUserMessage = '';
  let timestamp = new Date(0);
  let gitBranch = '';
  let cwd = '';
  let messageCount = 0;
  let slug = '';

  const rl = createInterface({
    input: createReadStream(filePath, { encoding: 'utf8' }),
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

    messageCount++;

    if (!cwd && raw.cwd) cwd = raw.cwd;
    if (!gitBranch && raw.gitBranch) gitBranch = raw.gitBranch;
    if (messageCount === 1) {
      timestamp = new Date(raw.timestamp);
      firstUserMessage = extractFirstText(raw.message.content);
    }
    if (raw.slug && !slug) slug = raw.slug;
  }

  if (!slug) {
    // derive slug from cwd
    slug = cwd ? cwd.split('/').filter(Boolean).pop() ?? 'session' : 'session';
  }

  return { firstMessage: firstUserMessage, timestamp, gitBranch, cwd, messageCount, slug };
}

function extractFirstText(content: ContentBlock[] | string): string {
  if (typeof content === 'string') return content.slice(0, 200);
  for (const block of content) {
    if (block.type === 'text') return block.text.slice(0, 200);
  }
  return '';
}

export async function extractTopTools(filePath: string): Promise<string[]> {
  const toolCounts: Record<string, number> = {};

  const rl = createInterface({
    input: createReadStream(filePath, { encoding: 'utf8' }),
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

    if (raw.type !== 'assistant' || !raw.message) continue;
    const content = Array.isArray(raw.message.content) ? raw.message.content : [];
    for (const block of content) {
      if (block.type === 'tool_use') {
        toolCounts[block.name] = (toolCounts[block.name] ?? 0) + 1;
      }
    }
  }

  return Object.entries(toolCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name]) => name);
}
