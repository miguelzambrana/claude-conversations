import { useMemo, useState } from 'react';
import type { Message } from '../lib/types.ts';
import MessageBlock from './MessageBlock.tsx';

interface Props {
  messages: Message[];
}

interface Turn {
  id: string;
  userMessage: Message;
  responses: Message[];
}

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
      // Responses before any user message — make a virtual turn
      current = {
        id: msg.uuid,
        userMessage: { ...msg, content: [], role: 'user' as const },
        responses: [msg],
      };
      turns.push(current);
    }
  }
  return turns;
}

export default function ConversationView({ messages }: Props) {
  const turns = useMemo(() => groupIntoTurns(messages), [messages]);

  // Map uuid → index for nextMessage lookups
  const msgIndex = useMemo(() => {
    const m = new Map<string, number>();
    messages.forEach((msg, i) => m.set(msg.uuid, i));
    return m;
  }, [messages]);

  function nextMessage(msg: Message): Message | undefined {
    const idx = msgIndex.get(msg.uuid);
    return idx !== undefined ? messages[idx + 1] : undefined;
  }

  if (messages.length === 0) {
    return <p className="text-gray-500 text-sm">No messages in this session.</p>;
  }

  return (
    <div className="space-y-2">
      {turns.map((turn) => (
        <TurnBlock key={turn.id} turn={turn} nextMessage={nextMessage} />
      ))}
    </div>
  );
}

interface TurnBlockProps {
  turn: Turn;
  nextMessage: (msg: Message) => Message | undefined;
}

function TurnBlock({ turn, nextMessage }: TurnBlockProps) {
  const [collapsed, setCollapsed] = useState(false);

  const toolCallCount = turn.responses.reduce(
    (n, msg) => n + msg.content.filter((b) => b.type === 'tool_use').length,
    0
  );
  const assistantTextCount = turn.responses.filter(
    (m) => m.role === 'assistant' && m.content.some((b) => b.type === 'text')
  ).length;

  const hasResponses = turn.responses.length > 0;
  // Skip empty virtual user messages
  const showUserMsg = turn.userMessage.content.length > 0;

  return (
    <div className="rounded-lg border border-gray-800 overflow-hidden">
      {/* User message row */}
      {showUserMsg && (
        <div className="bg-[#0d1117] px-4 pt-4 pb-2">
          <MessageBlock message={turn.userMessage} nextMessage={nextMessage(turn.userMessage)} />

          {hasResponses && (
            <button
              onClick={() => setCollapsed((v) => !v)}
              className="mt-3 flex items-center gap-2 text-xs text-gray-500 hover:text-gray-300 transition-colors group"
            >
              <span
                className={`inline-flex items-center justify-center w-4 h-4 rounded border border-gray-600 group-hover:border-gray-400 text-gray-500 group-hover:text-gray-300 transition-all text-xs ${
                  collapsed ? 'rotate-0' : 'rotate-90'
                }`}
                style={{ transition: 'transform 0.15s' }}
              >
                ▶
              </span>
              {collapsed ? (
                <span>
                  Show Claude's response
                  {toolCallCount > 0 && (
                    <span className="ml-1 text-gray-600">
                      ({toolCallCount} tool call{toolCallCount !== 1 ? 's' : ''})
                    </span>
                  )}
                </span>
              ) : (
                <span className="text-gray-600">Collapse</span>
              )}
            </button>
          )}
        </div>
      )}

      {/* Claude responses */}
      {hasResponses && !collapsed && (
        <div className="border-t border-gray-800 bg-[#0d1117]/50 px-4 py-4 space-y-4">
          {turn.responses.map((msg) => (
            <MessageBlock key={msg.uuid} message={msg} nextMessage={nextMessage(msg)} />
          ))}
        </div>
      )}

      {/* Collapsed summary */}
      {hasResponses && collapsed && (
        <div className="border-t border-gray-800 bg-[#0d1117]/30 px-4 py-2">
          <div className="flex items-center gap-3 text-xs text-gray-600">
            <span className="text-gray-700">Claude:</span>
            {toolCallCount > 0 && (
              <span className="rounded bg-gray-800 px-1.5 py-0.5 text-gray-500">
                {toolCallCount} tool call{toolCallCount !== 1 ? 's' : ''}
              </span>
            )}
            {assistantTextCount > 0 && (
              <span className="rounded bg-gray-800 px-1.5 py-0.5 text-gray-500">
                {assistantTextCount} response{assistantTextCount !== 1 ? 's' : ''}
              </span>
            )}
            <button
              onClick={() => setCollapsed(false)}
              className="ml-auto text-blue-500 hover:text-blue-400 transition-colors"
            >
              Show ▼
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
