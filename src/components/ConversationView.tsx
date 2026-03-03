import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function sumTokens(messages: Message[]): TokenUsage {
  return messages.reduce(
    (acc, msg) => {
      if (msg.usage) {
        acc.input_tokens += msg.usage.input_tokens;
        acc.output_tokens += msg.usage.output_tokens;
        acc.cache_creation_input_tokens += msg.usage.cache_creation_input_tokens;
        acc.cache_read_input_tokens += msg.usage.cache_read_input_tokens;
      }
      return acc;
    },
    { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ConversationView({ messages, sessionId }: Props) {
  const turns = useMemo(() => groupIntoTurns(messages), [messages]);
  const totals = useMemo(() => sumTokens(messages), [messages]);

  // uuid → index map for nextMessage lookups
  const msgIndex = useMemo(() => {
    const m = new Map<string, number>();
    messages.forEach((msg, i) => m.set(msg.uuid, i));
    return m;
  }, [messages]);

  function nextMessage(msg: Message): Message | undefined {
    const idx = msgIndex.get(msg.uuid);
    return idx !== undefined ? messages[idx + 1] : undefined;
  }

  // ── Persistent collapse state ──────────────────────────────────────────────
  const storageKey = `turns-collapsed-${sessionId}`;
  const [collapsedTurns, setCollapsedTurns] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? new Set(JSON.parse(saved) as string[]) : new Set();
    } catch {
      return new Set();
    }
  });

  const toggleTurn = useCallback(
    (turnId: string) => {
      setCollapsedTurns((prev) => {
        const next = new Set(prev);
        if (next.has(turnId)) next.delete(turnId);
        else next.add(turnId);
        try { localStorage.setItem(storageKey, JSON.stringify([...next])); } catch {}
        return next;
      });
    },
    [storageKey]
  );

  // ── Search ─────────────────────────────────────────────────────────────────
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [matchUuids, setMatchUuids] = useState<string[]>([]);
  const [matchIdx, setMatchIdx] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);

  // Ctrl/Cmd+F to toggle search
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

  // Recompute matches when query changes
  useEffect(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) { setMatchUuids([]); return; }
    const hits = messages.filter((m) => msgMatchesQuery(m, q)).map((m) => m.uuid);
    setMatchUuids(hits);
    setMatchIdx(0);
  }, [searchQuery, messages]);

  // Scroll to active match
  useEffect(() => {
    if (matchUuids.length === 0) return;
    const uuid = matchUuids[matchIdx];
    document.getElementById(uuid)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [matchIdx, matchUuids]);

  const goNext = () => setMatchIdx((i) => (i + 1) % matchUuids.length);
  const goPrev = () => setMatchIdx((i) => (i - 1 + matchUuids.length) % matchUuids.length);

  const handleSearchKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.shiftKey ? goPrev() : goNext(); }
  };

  // Set of turn IDs that contain a match → force-expand them
  const turnsWithMatches = useMemo(() => {
    if (!matchUuids.length) return new Set<string>();
    const matchSet = new Set(matchUuids);
    const out = new Set<string>();
    for (const turn of turns) {
      if (
        matchSet.has(turn.userMessage.uuid) ||
        turn.responses.some((m) => matchSet.has(m.uuid))
      ) {
        out.add(turn.id);
      }
    }
    return out;
  }, [matchUuids, turns]);

  // ── Scroll-to-hash on load ─────────────────────────────────────────────────
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    // Small delay to let React render all elements
    const timer = setTimeout(() => {
      document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 200);
    return () => clearTimeout(timer);
  }, []);

  if (messages.length === 0) {
    return <p className="text-gray-500 text-sm">No messages in this session.</p>;
  }

  const matchSet = new Set(matchUuids);
  const activeUuid = matchUuids[matchIdx];

  return (
    <div className="relative">
      {/* ── Token summary bar ─────────────────────────────────────────────── */}
      {(totals.input_tokens > 0 || totals.output_tokens > 0) && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-md border border-gray-800 bg-[#161b22] px-4 py-2 text-xs text-gray-500">
          <span className="font-semibold text-gray-400">Tokens</span>
          <span>↑ {totals.input_tokens.toLocaleString()} in</span>
          <span>↓ {totals.output_tokens.toLocaleString()} out</span>
          {totals.cache_read_input_tokens > 0 && (
            <span className="text-green-700">
              ⚡ {totals.cache_read_input_tokens.toLocaleString()} cache hits
            </span>
          )}
          {totals.cache_creation_input_tokens > 0 && (
            <span className="text-gray-600">
              🔒 {totals.cache_creation_input_tokens.toLocaleString()} cached
            </span>
          )}
          <span className="ml-auto text-gray-600">
            {turns.length} turn{turns.length !== 1 ? 's' : ''}
          </span>
          {/* Search shortcut hint */}
          <button
            onClick={() => { setSearchVisible(true); setTimeout(() => searchRef.current?.focus(), 30); }}
            className="ml-2 flex items-center gap-1 rounded border border-gray-700 px-2 py-0.5 text-gray-500 hover:text-gray-300 hover:border-gray-500 transition-colors"
          >
            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <span>
              <kbd className="font-mono">Ctrl+F</kbd>
            </span>
          </button>
        </div>
      )}

      {/* ── Search bar ────────────────────────────────────────────────────── */}
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
              {matchUuids.length === 0
                ? 'no results'
                : `${matchIdx + 1} / ${matchUuids.length}`}
            </span>
          )}
          {matchUuids.length > 1 && (
            <>
              <button onClick={goPrev} className="text-gray-400 hover:text-gray-200 px-1" title="Previous (Shift+Enter)">↑</button>
              <button onClick={goNext} className="text-gray-400 hover:text-gray-200 px-1" title="Next (Enter)">↓</button>
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

      {/* ── Turns ─────────────────────────────────────────────────────────── */}
      <div className="space-y-2">
        {turns.map((turn) => (
          <TurnBlock
            key={turn.id}
            turn={turn}
            isCollapsed={collapsedTurns.has(turn.id) && !turnsWithMatches.has(turn.id)}
            onToggle={() => toggleTurn(turn.id)}
            nextMessage={nextMessage}
            matchSet={matchSet}
            activeUuid={activeUuid}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Turn block ───────────────────────────────────────────────────────────────

interface TurnBlockProps {
  turn: Turn;
  isCollapsed: boolean;
  onToggle: () => void;
  nextMessage: (msg: Message) => Message | undefined;
  matchSet: Set<string>;
  activeUuid: string | undefined;
}

function TurnBlock({ turn, isCollapsed, onToggle, nextMessage, matchSet, activeUuid }: TurnBlockProps) {
  const toolCallCount = turn.responses.reduce(
    (n, msg) => n + msg.content.filter((b) => b.type === 'tool_use').length,
    0
  );
  const assistantCount = turn.responses.filter(
    (m) => m.role === 'assistant' && m.content.some((b) => b.type === 'text')
  ).length;

  const turnTokens = useMemo(
    () => sumTokens(turn.responses),
    [turn.responses]
  );

  const hasResponses = turn.responses.length > 0;
  const showUserMsg = turn.userMessage.content.length > 0;

  const userIsMatch = matchSet.has(turn.userMessage.uuid);
  const userIsActive = turn.userMessage.uuid === activeUuid;

  return (
    <div className="rounded-lg border border-gray-800 overflow-hidden">
      {/* User message */}
      {showUserMsg && (
        <div className="bg-[#0d1117] px-4 pt-4 pb-2">
          <MessageBlock
            message={turn.userMessage}
            nextMessage={nextMessage(turn.userMessage)}
            isMatch={userIsMatch}
            isActiveMatch={userIsActive}
          />

          {hasResponses && (
            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={onToggle}
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors group"
              >
                <span
                  className="inline-flex items-center justify-center w-4 h-4 rounded border border-gray-700 group-hover:border-gray-500 text-xs transition-all"
                  style={{ transform: isCollapsed ? 'rotate(0deg)' : 'rotate(90deg)', transition: 'transform 0.15s' }}
                >
                  ▶
                </span>
                {isCollapsed ? (
                  <span className="text-gray-600 hover:text-gray-400">
                    Show response
                    {toolCallCount > 0 && <span className="ml-1">· {toolCallCount} tool call{toolCallCount !== 1 ? 's' : ''}</span>}
                  </span>
                ) : (
                  <span className="text-gray-700 hover:text-gray-500">Collapse</span>
                )}
              </button>

              {/* Per-turn token count */}
              {!isCollapsed && (turnTokens.input_tokens > 0 || turnTokens.output_tokens > 0) && (
                <span className="ml-auto text-xs text-gray-700">
                  ↑{turnTokens.input_tokens.toLocaleString()} ↓{turnTokens.output_tokens.toLocaleString()}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Responses (expanded) */}
      {hasResponses && !isCollapsed && (
        <div className="border-t border-gray-800 bg-[#0d1117]/50 px-4 py-4 space-y-4">
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

      {/* Collapsed summary */}
      {hasResponses && isCollapsed && (
        <div className="border-t border-gray-800 bg-[#0d1117]/30 px-4 py-2">
          <div className="flex items-center gap-3 text-xs text-gray-700">
            {toolCallCount > 0 && (
              <span className="rounded bg-gray-800/50 px-1.5 py-0.5 text-gray-600">
                {toolCallCount} tool call{toolCallCount !== 1 ? 's' : ''}
              </span>
            )}
            {assistantCount > 0 && (
              <span className="rounded bg-gray-800/50 px-1.5 py-0.5 text-gray-600">
                {assistantCount} response{assistantCount !== 1 ? 's' : ''}
              </span>
            )}
            {turnTokens.output_tokens > 0 && (
              <span className="text-gray-700">↓{turnTokens.output_tokens.toLocaleString()} tok</span>
            )}
            <button
              onClick={onToggle}
              className="ml-auto text-blue-600 hover:text-blue-400 transition-colors"
            >
              Show ▼
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

