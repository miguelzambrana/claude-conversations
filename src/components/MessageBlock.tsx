import { useState } from 'react';
import type { Message, ToolUseBlock, ToolResultBlock, ContentBlock } from '../lib/types.ts';
import ToolCallBlock from './ToolCallBlock.tsx';

interface Props {
  message: Message;
  nextMessage?: Message;
}

function formatTime(d: Date | string): string {
  return new Date(d).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function renderText(text: string): string {
  // Simple markdown-like rendering using HTML
  return text;
}

export default function MessageBlock({ message, nextMessage }: Props) {
  const [thinkingOpen, setThinkingOpen] = useState(false);
  const isUser = message.role === 'user';

  // Build a map of tool_use_id -> tool_result from next message
  const toolResultMap = new Map<string, ToolResultBlock>();
  if (nextMessage?.role === 'user') {
    for (const block of nextMessage.content) {
      if (block.type === 'tool_result') {
        toolResultMap.set(block.tool_use_id, block);
      }
    }
  }

  // Check if this is purely a tool result message (no visible user text)
  if (isUser) {
    const hasOnlyToolResults = message.content.every(
      (b) => b.type === 'tool_result'
    );
    if (hasOnlyToolResults) return null;
  }

  return (
    <div
      id={message.uuid}
      className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
    >
      {/* Avatar */}
      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
        isUser ? 'bg-blue-600 text-white' : 'bg-gray-600 text-white'
      }`}>
        {isUser ? 'U' : 'A'}
      </div>

      {/* Bubble */}
      <div className={`flex-1 min-w-0 max-w-3xl ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
        <div className={`text-xs text-gray-500 mb-1 ${isUser ? 'text-right' : 'text-left'}`}>
          {isUser ? 'User' : 'Claude'} · {formatTime(message.timestamp)}
          {message.gitBranch && <span className="ml-2 text-gray-600">({message.gitBranch})</span>}
        </div>

        <div className={`rounded-lg px-4 py-3 text-sm leading-relaxed w-full ${
          isUser
            ? 'bg-blue-900 text-blue-100 rounded-tr-none'
            : 'bg-[#1c2128] text-gray-200 rounded-tl-none border border-gray-700'
        }`}>
          {message.content.map((block, i) => (
            <ContentRenderer
              key={i}
              block={block}
              toolResultMap={toolResultMap}
              thinkingOpen={thinkingOpen}
              setThinkingOpen={setThinkingOpen}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

interface ContentRendererProps {
  block: ContentBlock;
  toolResultMap: Map<string, ToolResultBlock>;
  thinkingOpen: boolean;
  setThinkingOpen: (v: boolean) => void;
}

function ContentRenderer({ block, toolResultMap, thinkingOpen, setThinkingOpen }: ContentRendererProps) {
  if (block.type === 'text') {
    if (!block.text.trim()) return null;
    return (
      <div className="whitespace-pre-wrap break-words">
        {block.text}
      </div>
    );
  }

  if (block.type === 'thinking') {
    return (
      <div className="my-2">
        <button
          onClick={() => setThinkingOpen(!thinkingOpen)}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-400"
        >
          <span>{thinkingOpen ? '▼' : '▶'}</span>
          <span className="italic">Thinking…</span>
        </button>
        {thinkingOpen && (
          <div className="mt-1 rounded bg-gray-900 border border-gray-700 px-3 py-2 text-xs text-gray-500 italic whitespace-pre-wrap max-h-48 overflow-y-auto">
            {block.thinking}
          </div>
        )}
      </div>
    );
  }

  if (block.type === 'tool_use') {
    const result = toolResultMap.get(block.id);
    return (
      <div className="my-2">
        <ToolCallBlock toolUse={block} toolResult={result} />
      </div>
    );
  }

  if (block.type === 'tool_result') {
    // Rendered inside assistant message via toolResultMap — skip standalone rendering
    return null;
  }

  return null;
}
