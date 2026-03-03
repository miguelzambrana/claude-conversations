import { createReadStream, statSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { basename } from 'node:path';
import { listProjectDirs, listSessionFiles, projectIdFromDir } from './projects.ts';
import type { RawMessage, ContentBlock, Message } from './types.ts';

// ─── Pricing (server-side copy) ───────────────────────────────────────────────

const PRICING: Record<string, { in: number; out: number; cacheW: number; cacheR: number }> = {
  'claude-opus-4':   { in: 15.00, out: 75.00, cacheW: 18.75, cacheR: 1.50 },
  'claude-sonnet-4': { in:  3.00, out: 15.00, cacheW:  3.75, cacheR: 0.30 },
  'claude-haiku-4':  { in:  0.80, out:  4.00, cacheW:  1.00, cacheR: 0.08 },
};

type UsageFields = { input_tokens?: number; output_tokens?: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number };

function calcCost(usage: UsageFields, model?: string): number {
  let p = PRICING['claude-sonnet-4'];
  if (model) {
    for (const [key, rates] of Object.entries(PRICING)) {
      if (model.includes(key)) { p = rates; break; }
    }
  }
  return (
    (usage.input_tokens ?? 0)                * p.in     / 1_000_000 +
    (usage.output_tokens ?? 0)               * p.out    / 1_000_000 +
    (usage.cache_creation_input_tokens ?? 0) * p.cacheW / 1_000_000 +
    (usage.cache_read_input_tokens ?? 0)     * p.cacheR / 1_000_000
  );
}

function shortModel(model: string): 'sonnet' | 'opus' | 'haiku' | null {
  const m = model.toLowerCase();
  if (m.includes('opus'))   return 'opus';
  if (m.includes('sonnet')) return 'sonnet';
  if (m.includes('haiku'))  return 'haiku';
  return null;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SessionStats {
  sessionId: string;
  projectId: string;
  projectName: string;
  sessionSlug: string;
  timestamp: Date;
  totalCost: number;
  inputTokens: number;
  outputTokens: number;
  toolCounts: Record<string, number>;
  messageCount: number;
  models: Array<'sonnet' | 'opus' | 'haiku'>;
}

export interface AnalyticsAggregates {
  totalCost: number;
  thisMonthCost: number;
  totalSessions: number;
  totalMessages: number;
  projectCosts: Array<{ id: string; name: string; cost: number; sessions: number }>;
  toolUsage: Array<[string, number]>;
  sessionsByDay: Map<string, number>;
  modelCounts: { sonnet: number; opus: number; haiku: number };
  monthlyCosts: Array<{ label: string; cost: number }>;
}

// ─── In-memory cache ──────────────────────────────────────────────────────────

const SKIP_TYPES = new Set(['progress', 'file-history-snapshot', 'system']);
const CACHE_TTL  = 5 * 60 * 1000; // 5 minutes

let _cache: SessionStats[] | null = null;
let _cacheAt = 0;

export async function getAllSessionStats(forceRefresh = false): Promise<SessionStats[]> {
  if (!forceRefresh && _cache && Date.now() - _cacheAt < CACHE_TTL) return _cache;

  const rows: SessionStats[] = [];
  for (const projectDir of listProjectDirs()) {
    const projectId = projectIdFromDir(projectDir);
    for (const sf of listSessionFiles(projectDir)) {
      try {
        rows.push(await parseSessionStats(sf, basename(sf, '.jsonl'), projectId));
      } catch { /* skip */ }
    }
  }

  _cache  = rows;
  _cacheAt = Date.now();
  return rows;
}

async function parseSessionStats(filePath: string, sessionId: string, projectId: string): Promise<SessionStats> {
  let sessionSlug = sessionId.slice(0, 8);
  let projectName = projectId.split('-').filter(Boolean).pop() ?? projectId;
  let timestamp   = new Date(statSync(filePath).mtime);
  let totalCost   = 0, inputTokens = 0, outputTokens = 0, messageCount = 0;
  const toolCounts: Record<string, number> = {};
  const modelsSet = new Set<'sonnet' | 'opus' | 'haiku'>();
  let isFirst = true;

  const rl = createInterface({ input: createReadStream(filePath, { encoding: 'utf8' }), crlfDelay: Infinity });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let raw: RawMessage;
    try { raw = JSON.parse(trimmed) as RawMessage; } catch { continue; }

    if (SKIP_TYPES.has(raw.type) || (raw.type !== 'user' && raw.type !== 'assistant') || !raw.message) continue;

    messageCount++;
    if (isFirst) { timestamp = new Date(raw.timestamp); isFirst = false; }
    if (raw.slug && sessionSlug === sessionId.slice(0, 8)) sessionSlug = raw.slug;
    if (raw.cwd && projectName === projectId.split('-').filter(Boolean).pop()) {
      projectName = raw.cwd.split('/').filter(Boolean).pop() ?? projectName;
    }

    if (raw.type === 'assistant' && raw.message.usage) {
      totalCost    += calcCost(raw.message.usage, raw.message.model);
      inputTokens  += raw.message.usage.input_tokens ?? 0;
      outputTokens += raw.message.usage.output_tokens ?? 0;
      if (raw.message.model) {
        const sm = shortModel(raw.message.model);
        if (sm) modelsSet.add(sm);
      }
    }
    if (raw.type === 'assistant' && Array.isArray(raw.message.content)) {
      for (const b of raw.message.content as ContentBlock[]) {
        if (b.type === 'tool_use') toolCounts[b.name] = (toolCounts[b.name] ?? 0) + 1;
      }
    }
  }

  return { sessionId, projectId, projectName, sessionSlug, timestamp, totalCost, inputTokens, outputTokens, toolCounts, messageCount, models: [...modelsSet] };
}

// ─── Aggregation ──────────────────────────────────────────────────────────────

export function aggregateStats(sessions: SessionStats[]): AnalyticsAggregates {
  const now = new Date();

  const thisMonthCost = sessions
    .filter(s => { const d = new Date(s.timestamp); return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth(); })
    .reduce((a, s) => a + s.totalCost, 0);

  const totalCost     = sessions.reduce((a, s) => a + s.totalCost, 0);
  const totalMessages = sessions.reduce((a, s) => a + s.messageCount, 0);

  // Cost per project
  const projMap = new Map<string, { name: string; cost: number; sessions: number }>();
  for (const s of sessions) {
    const p = projMap.get(s.projectId) ?? { name: s.projectName, cost: 0, sessions: 0 };
    p.cost += s.totalCost; p.sessions++;
    projMap.set(s.projectId, p);
  }
  const projectCosts = [...projMap.entries()]
    .map(([id, d]) => ({ id, ...d }))
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 12);

  // Tool usage
  const toolMap = new Map<string, number>();
  for (const s of sessions)
    for (const [t, c] of Object.entries(s.toolCounts)) toolMap.set(t, (toolMap.get(t) ?? 0) + c);
  const toolUsage = [...toolMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);

  // Sessions by day
  const sessionsByDay = new Map<string, number>();
  for (const s of sessions) {
    const day = new Date(s.timestamp).toISOString().slice(0, 10);
    sessionsByDay.set(day, (sessionsByDay.get(day) ?? 0) + 1);
  }

  // Model counts (count sessions that used each model)
  const modelCounts = { sonnet: 0, opus: 0, haiku: 0 };
  for (const s of sessions)
    for (const m of s.models) modelCounts[m] = (modelCounts[m] ?? 0) + 1;

  // Monthly costs (last 12 months)
  const monthlyCosts: Array<{ label: string; cost: number }> = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleString('en-US', { month: 'short', year: '2-digit' });
    const cost = sessions
      .filter(s => new Date(s.timestamp).toISOString().slice(0, 7) === key)
      .reduce((a, s) => a + s.totalCost, 0);
    monthlyCosts.push({ label, cost });
  }

  return { totalCost, thisMonthCost, totalSessions: sessions.length, totalMessages, projectCosts, toolUsage, sessionsByDay, modelCounts, monthlyCosts };
}

// ─── Helpers for session pages ────────────────────────────────────────────────

export function computeMessagesCost(messages: Message[]): number {
  return messages.reduce((sum, msg) => {
    if (msg.role === 'assistant' && msg.usage) return sum + calcCost(msg.usage, msg.model);
    return sum;
  }, 0);
}

export function formatCost(cost: number): string {
  if (cost === 0)       return '$0.00';
  if (cost < 0.0001)    return '<$0.0001';
  if (cost < 0.01)      return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(3)}`;
}
