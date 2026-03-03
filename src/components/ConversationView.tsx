import { useMemo, useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import type { Message, TokenUsage } from '../lib/types.ts';
import MessageBlock from './MessageBlock.tsx';

interface Props {
  messages: Message[];
  sessionId: string;
}

interface Turn {
  id: string;
  userMessage: Message;
  responses: Message[];
}

// ─── Pricing ──────────────────────────────────────────────────────────────────

const PRICING: Record<string, { in: number; out: number; cacheW: number; cacheR: number }> = {
  'claude-opus-4':   { in: 15.00, out: 75.00, cacheW: 18.75, cacheR: 1.50 },
  'claude-sonnet-4': { in:  3.00, out: 15.00, cacheW:  3.75, cacheR: 0.30 },
  'claude-haiku-4':  { in:  0.80, out:  4.00, cacheW:  1.00, cacheR: 0.08 },
};

function getPricing(model?: string) {
  if (!model) return PRICING['claude-sonnet-4'];
  for (const [key, p] of Object.entries(PRICING)) {
    if (model.includes(key)) return p;
  }
  return PRICING['claude-sonnet-4'];
}

function calcCost(usage: TokenUsage, model?: string): number {
  const p = getPricing(model);
  return (
    usage.input_tokens                * p.in     / 1_000_000 +
    usage.output_tokens               * p.out    / 1_000_000 +
    usage.cache_creation_input_tokens * p.cacheW / 1_000_000 +
    usage.cache_read_input_tokens     * p.cacheR / 1_000_000
  );
}

function formatCost(cost: number): string {
  if (cost === 0) return '';
  if (cost < 0.0001) return '<$0.0001';
  if (cost < 0.01)   return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(3)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

// ─── Model display ─────────────────────────────────────────────────────────────

const MODEL_META: Record<string, { label: string; textClass: string; borderColor: string; dotColor: string }> = {
  opus:   { label: 'Opus',   textClass: 'text-rose-400', borderColor: '#9f1239', dotColor: '#f43f5e' },
  sonnet: { label: 'Sonnet', textClass: 'text-blue-400', borderColor: '#1e40af', dotColor: '#3b82f6' },
  haiku:  { label: 'Haiku',  textClass: 'text-teal-400', borderColor: '#0f766e', dotColor: '#14b8a6' },
};
const MODEL_DEFAULT = { label: 'Claude', textClass: 'text-gray-400', borderColor: '#374151', dotColor: '#6b7280' };

function getModelMeta(model?: string) {
  if (!model) return MODEL_DEFAULT;
  const m = model.toLowerCase();
  if (m.includes('opus'))   return MODEL_META.opus;
  if (m.includes('sonnet')) return MODEL_META.sonnet;
  if (m.includes('haiku'))  return MODEL_META.haiku;
  return MODEL_DEFAULT;
}

// ─── Turn helpers ──────────────────────────────────────────────────────────────

function isPureToolResult(msg: Message): boolean {
  return msg.content.length > 0 && msg.content.every((b) => b.type === 'tool_result');
}

function groupIntoTurns(messages: Message[]): Turn[] {
  const turns: Turn[] = [];
  let current: Turn | null = null;

  for (const msg of messages) {
    const isRealUser = msg.role === 'user' && !isPureToolResult(msg);
    if (isRealUser) {
      current = { id: msg.uuid, userMessage: msg, responses: [] };
      turns.push(current);
    } else if (current) {
      current.responses.push(msg);
    } else {
      current = { id: msg.uuid, userMessage: { ...msg, content: [], role: 'user' as const }, responses: [msg] };
      turns.push(current);
    }
  }
  return turns;
}

function msgMatchesQuery(msg: Message, q: string): boolean {
  for (const block of msg.content) {
    if (block.type === 'text' && block.text.toLowerCase().includes(q)) return true;
    if (block.type === 'tool_use') {
      if (block.name.toLowerCase().includes(q)) return true;
      for (const val of Object.values(block.input)) {
        if (typeof val === 'string' && val.toLowerCase().includes(q)) return true;
      }
    }
  }
  return false;
}

function sumUsage(messages: Message[]): TokenUsage {
  return messages.reduce(
    (acc, msg) => {
      if (msg.usage) {
        acc.input_tokens                  += msg.usage.input_tokens;
        acc.output_tokens                 += msg.usage.output_tokens;
        acc.cache_creation_input_tokens   += msg.usage.cache_creation_input_tokens;
        acc.cache_read_input_tokens       += msg.usage.cache_read_input_tokens;
      }
      return acc;
    },
    { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }
  );
}

function totalCostForMessages(messages: Message[]): number {
  return messages.reduce((sum, msg) => {
    if (msg.usage && msg.role === 'assistant') return sum + calcCost(msg.usage, msg.model);
    return sum;
  }, 0);
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function ConversationView({ messages, sessionId }: Props) {
  const turns     = useMemo(() => groupIntoTurns(messages), [messages]);
  const totals    = useMemo(() => sumUsage(messages),        [messages]);
  const totalCost = useMemo(() => totalCostForMessages(messages), [messages]);

  const msgIndex = useMemo(() => {
    const m = new Map<string, number>();
    messages.forEach((msg, i) => m.set(msg.uuid, i));
    return m;
  }, [messages]);

  function nextMessage(msg: Message): Message | undefined {
    const idx = msgIndex.get(msg.uuid);
    return idx !== undefined ? messages[idx + 1] : undefined;
  }

  // UUID → turn index for virtualizer scroll navigation
  const uuidToTurnIdx = useMemo(() => {
    const m = new Map<string, number>();
    turns.forEach((turn, i) => {
      m.set(turn.userMessage.uuid, i);
      turn.responses.forEach((msg) => m.set(msg.uuid, i));
    });
    return m;
  }, [turns]);

  // Models present in this session (for legend)
  const modelsInSession = useMemo(() => {
    const s = new Set<string>();
    for (const msg of messages) {
      if (msg.role === 'assistant' && msg.model) {
        const m = msg.model.toLowerCase();
        if (m.includes('opus'))        s.add('opus');
        else if (m.includes('sonnet')) s.add('sonnet');
        else if (m.includes('haiku'))  s.add('haiku');
      }
    }
    return s;
  }, [messages]);

  // ── Persistent collapse ────────────────────────────────────────────────────
  const storageKey = `turns-collapsed-${sessionId}`;
  const [collapsedTurns, setCollapsedTurns] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? new Set(JSON.parse(saved) as string[]) : new Set();
    } catch { return new Set(); }
  });

  const toggleTurn = useCallback((turnId: string) => {
    setCollapsedTurns((prev) => {
      const next = new Set(prev);
      if (next.has(turnId)) next.delete(turnId);
      else next.add(turnId);
      try { localStorage.setItem(storageKey, JSON.stringify([...next])); } catch {}
      return next;
    });
  }, [storageKey]);

  // ── Search ─────────────────────────────────────────────────────────────────
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery,   setSearchQuery]   = useState('');
  const [matchUuids,    setMatchUuids]    = useState<string[]>([]);
  const [matchIdx,      setMatchIdx]      = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setSearchVisible((v) => {
          const next = !v;
          if (next) setTimeout(() => searchRef.current?.focus(), 30);
          return next;
        });
      }
      if (e.key === 'Escape') {
        setSearchVisible(false);
        setSearchQuery('');
        setMatchUuids([]);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) { setMatchUuids([]); return; }
    setMatchUuids(messages.filter((m) => msgMatchesQuery(m, q)).map((m) => m.uuid));
    setMatchIdx(0);
  }, [searchQuery, messages]);

  const goNext = () => setMatchIdx((i) => (i + 1) % matchUuids.length);
  const goPrev = () => setMatchIdx((i) => (i - 1 + matchUuids.length) % matchUuids.length);
  const handleSearchKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.shiftKey ? goPrev() : goNext(); }
  };

  const turnsWithMatches = useMemo(() => {
    if (!matchUuids.length) return new Set<string>();
    const matchSet = new Set(matchUuids);
    const out = new Set<string>();
    for (const turn of turns) {
      if (matchSet.has(turn.userMessage.uuid) || turn.responses.some((m) => matchSet.has(m.uuid))) {
        out.add(turn.id);
      }
    }
    return out;
  }, [matchUuids, turns]);

  // ── Virtual scrolling ──────────────────────────────────────────────────────
  const listRef = useRef<HTMLDivElement>(null);
  const [listOffset, setListOffset] = useState(0);

  useLayoutEffect(() => {
    setListOffset(listRef.current?.offsetTop ?? 0);
  }, []);

  const virtualizer = useWindowVirtualizer({
    count: turns.length,
    estimateSize: () => 300,
    overscan: 4,
    scrollMargin: listOffset,
  });

  // Search scroll via virtualizer
  useEffect(() => {
    if (!matchUuids.length) return;
    const turnIdx = uuidToTurnIdx.get(matchUuids[matchIdx]);
    if (turnIdx !== undefined) {
      virtualizer.scrollToIndex(turnIdx, { align: 'start', behavior: 'smooth' });
    }
  }, [matchIdx, matchUuids]);

  // Hash scroll on load via virtualizer
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    const turnIdx = uuidToTurnIdx.get(hash);
    if (turnIdx !== undefined) {
      const timer = setTimeout(() => {
        virtualizer.scrollToIndex(turnIdx, { align: 'start', behavior: 'smooth' });
      }, 300);
      return () => clearTimeout(timer);
    }
  }, []);

  if (messages.length === 0) {
    return <p className="text-gray-500 text-sm">No messages in this session.</p>;
  }

  const matchSet   = new Set(matchUuids);
  const activeUuid = matchUuids[matchIdx];
  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div className="relative">
      {/* ── Session stats bar ───────────────────────────────────────────────── */}
      {(totals.input_tokens > 0 || totals.output_tokens > 0) && (
        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-gray-800 bg-[#161b22] px-4 py-2.5 text-xs">
          <span className="font-semibold text-gray-300">Session</span>

          <span className="text-gray-500">
            <span className="text-gray-400">{turns.length}</span> turns
          </span>

          <span className="text-gray-500">
            <span className="text-gray-400">{formatTokens(totals.input_tokens)}</span> in
            {' / '}
            <span className="text-gray-400">{formatTokens(totals.output_tokens)}</span> out
          </span>

          {totals.cache_read_input_tokens > 0 && (
            <span className="text-green-700">
              ⚡ {formatTokens(totals.cache_read_input_tokens)} cached
            </span>
          )}

          {totalCost > 0 && (
            <span className="font-mono font-semibold text-emerald-500">
              {formatCost(totalCost)}
            </span>
          )}

          {/* Model legend */}
          {modelsInSession.size > 0 && (
            <span className="flex items-center gap-2 border-l border-gray-700 pl-3 ml-1">
              {(['sonnet', 'opus', 'haiku'] as const).filter((k) => modelsInSession.has(k)).map((k) => {
                const meta = MODEL_META[k];
                return (
                  <span key={k} className="flex items-center gap-1">
                    <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: meta.dotColor }} />
                    <span className="text-gray-500">{meta.label}</span>
                  </span>
                );
              })}
            </span>
          )}

          {/* Search button */}
          <button
            onClick={() => { setSearchVisible(true); setTimeout(() => searchRef.current?.focus(), 30); }}
            className="ml-auto flex items-center gap-1.5 rounded border border-gray-700 px-2 py-0.5 text-gray-500 hover:text-gray-300 hover:border-gray-500 transition-colors"
          >
            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <kbd className="font-mono text-xs">Ctrl+F</kbd>
          </button>
        </div>
      )}

      {/* ── Search bar ──────────────────────────────────────────────────────── */}
      {searchVisible && (
        <div className="sticky top-16 z-30 mb-4 flex items-center gap-2 rounded-md border border-gray-600 bg-[#1c2128] px-3 py-2 shadow-xl">
          <svg className="h-4 w-4 flex-shrink-0 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={searchRef}
            type="text"
            placeholder="Search messages… (Enter = next, Shift+Enter = prev)"
            className="flex-1 bg-transparent text-sm text-gray-200 placeholder-gray-500 outline-none"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleSearchKey}
          />
          {searchQuery && (
            <span className="flex-shrink-0 text-xs text-gray-500">
              {matchUuids.length === 0 ? 'no results' : `${matchIdx + 1} / ${matchUuids.length}`}
            </span>
          )}
          {matchUuids.length > 1 && (
            <>
              <button onClick={goPrev} className="text-gray-400 hover:text-gray-200 px-1" title="Shift+Enter">↑</button>
              <button onClick={goNext} className="text-gray-400 hover:text-gray-200 px-1" title="Enter">↓</button>
            </>
          )}
          <button
            onClick={() => { setSearchVisible(false); setSearchQuery(''); setMatchUuids([]); }}
            className="flex-shrink-0 text-gray-500 hover:text-gray-300 px-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Virtualized turns list ───────────────────────────────────────────── */}
      <div ref={listRef}>
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualItems.map((virtualRow) => {
            const turn = turns[virtualRow.index];
            return (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start - virtualizer.options.scrollMargin}px)`,
                  paddingBottom: '12px',
                }}
              >
                <TurnBlock
                  turn={turn}
                  isCollapsed={collapsedTurns.has(turn.id) && !turnsWithMatches.has(turn.id)}
                  onToggle={() => toggleTurn(turn.id)}
                  nextMessage={nextMessage}
                  matchSet={matchSet}
                  activeUuid={activeUuid}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Turn block ────────────────────────────────────────────────────────────────

interface TurnBlockProps {
  turn: Turn;
  isCollapsed: boolean;
  onToggle: () => void;
  nextMessage: (msg: Message) => Message | undefined;
  matchSet: Set<string>;
  activeUuid: string | undefined;
}

function TurnBlock({ turn, isCollapsed, onToggle, nextMessage, matchSet, activeUuid }: TurnBlockProps) {
  const hasResponses = turn.responses.length > 0;
  const showUserMsg  = turn.userMessage.content.length > 0;

  const toolCallCount = turn.responses.reduce(
    (n, msg) => n + msg.content.filter((b) => b.type === 'tool_use').length,
    0
  );

  const turnModel = turn.responses.find((m) => m.role === 'assistant')?.model;
  const modelMeta = getModelMeta(turnModel);
  const turnUsage = useMemo(() => sumUsage(turn.responses),              [turn.responses]);
  const turnCost  = useMemo(() => totalCostForMessages(turn.responses),  [turn.responses]);

  return (
    <div
      className="rounded-xl border border-gray-800 overflow-hidden"
      style={hasResponses ? { borderLeftColor: modelMeta.borderColor, borderLeftWidth: '3px' } : undefined}
    >
      {/* ── User message ──────────────────────────────────────────────────── */}
      {showUserMsg && (
        <div className="bg-[#0d1117] px-5 pt-4 pb-4">
          <MessageBlock
            message={turn.userMessage}
            nextMessage={nextMessage(turn.userMessage)}
            isMatch={matchSet.has(turn.userMessage.uuid)}
            isActiveMatch={turn.userMessage.uuid === activeUuid}
          />
        </div>
      )}

      {/* ── Claude section header (collapse control) ──────────────────────── */}
      {hasResponses && (
        <button
          onClick={onToggle}
          className="w-full flex items-center gap-3 px-5 py-2.5 text-left select-none
                     border-t border-gray-800 transition-colors duration-150
                     bg-[#090d12] hover:bg-[#0d1117] group"
        >
          {/* AI badge */}
          <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-gray-700 text-[10px] font-bold text-gray-300">
            AI
          </span>

          {/* Model name with dynamic color */}
          <span className={`text-xs font-semibold ${modelMeta.textClass}`}>
            {modelMeta.label}
          </span>

          {/* Tool count pill */}
          {toolCallCount > 0 && (
            <span className="rounded-full border border-gray-700 bg-gray-800 px-2 py-0.5 text-xs text-gray-500">
              {toolCallCount} tool{toolCallCount !== 1 ? 's' : ''}
            </span>
          )}

          <div className="flex-1" />

          {/* Cost */}
          {turnCost > 0 && (
            <span className="font-mono text-xs font-semibold text-emerald-600 group-hover:text-emerald-500 transition-colors">
              {formatCost(turnCost)}
            </span>
          )}

          {/* Output tokens */}
          {turnUsage.output_tokens > 0 && (
            <span className="text-xs text-gray-600 font-mono">
              {formatTokens(turnUsage.output_tokens)} tok
            </span>
          )}

          {/* Chevron */}
          <svg
            className={`h-4 w-4 flex-shrink-0 text-gray-600 group-hover:text-gray-400 transition-all duration-200 ${
              isCollapsed ? '' : 'rotate-180'
            }`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      )}

      {/* ── Claude responses ───────────────────────────────────────────────── */}
      {hasResponses && !isCollapsed && (
        <div className="border-t border-gray-800/60 bg-[#0b0f14] px-5 py-4 space-y-4">
          {turn.responses.map((msg) => (
            <MessageBlock
              key={msg.uuid}
              message={msg}
              nextMessage={nextMessage(msg)}
              isMatch={matchSet.has(msg.uuid)}
              isActiveMatch={msg.uuid === activeUuid}
            />
          ))}
        </div>
      )}
    </div>
  );
}
