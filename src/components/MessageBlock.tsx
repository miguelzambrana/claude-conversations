import { useState } from 'react';
import type { Message, ToolUseBlock, ToolResultBlock, ContentBlock } from '../lib/types.ts';
import ToolCallBlock from './ToolCallBlock.tsx';
import MonacoCode from './MonacoCode.tsx';
import { editorHeight } from './MonacoCode.tsx';

interface Props {
  message: Message;
  nextMessage?: Message;
}

function formatTime(d: Date | string): string {
  return new Date(d).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

// Split text into plain text and code fence segments
interface TextSegment { kind: 'text'; content: string }
interface CodeSegment { kind: 'code'; lang: string; content: string }
type Segment = TextSegment | CodeSegment;

function parseSegments(text: string): Segment[] {
  const segments: Segment[] = [];
  const fenceRe = /```(\w*)\n?([\s\S]*?)```/g;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = fenceRe.exec(text)) !== null) {
    if (match.index > last) {
      segments.push({ kind: 'text', content: text.slice(last, match.index) });
    }
    segments.push({ kind: 'code', lang: match[1] || 'plaintext', content: match[2] });
    last = fenceRe.lastIndex;
  }

  if (last < text.length) {
    segments.push({ kind: 'text', content: text.slice(last) });
  }

  return segments;
}

function hasCodeFences(text: string): boolean {
  return /```[\s\S]*?```/.test(text);
}

export default function MessageBlock({ message, nextMessage }: Props) {
  const [thinkingOpen, setThinkingOpen] = useState(false);
  const isUser = message.role === 'user';

  const toolResultMap = new Map<string, ToolResultBlock>();
  if (nextMessage?.role === 'user') {
    for (const block of nextMessage.content) {
      if (block.type === 'tool_result') {
        toolResultMap.set(block.tool_use_id, block);
      }
    }
  }

  if (isUser) {
    const hasOnlyToolResults = message.content.length > 0 && message.content.every((b) => b.type === 'tool_result');
    if (hasOnlyToolResults) return null;
  }

  return (
    <div id={message.uuid} className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      <div
        className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
          isUser ? 'bg-blue-600 text-white' : 'bg-gray-600 text-white'
        }`}
      >
        {isUser ? 'U' : 'AI'}
      </div>

      {/* Bubble */}
      <div className={`flex-1 min-w-0 max-w-3xl flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
        <div className={`text-xs text-gray-500 mb-1 ${isUser ? 'text-right' : 'text-left'}`}>
          {isUser ? 'User' : 'Claude'} · {formatTime(message.timestamp)}
          {message.gitBranch && <span className="ml-2 text-gray-600">({message.gitBranch})</span>}
        </div>

        <div
          className={`rounded-lg px-4 py-3 text-sm leading-relaxed w-full ${
            isUser
              ? 'bg-blue-900/60 text-blue-100 rounded-tr-none border border-blue-800/50'
              : 'bg-[#1c2128] text-gray-200 rounded-tl-none border border-gray-700/60'
          }`}
        >
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
    if (hasCodeFences(block.text)) {
      return <RichText text={block.text} />;
    }
    return <div className="whitespace-pre-wrap break-words">{block.text}</div>;
  }

  if (block.type === 'thinking') {
    return (
      <div className="my-2">
        <button
          onClick={() => setThinkingOpen(!thinkingOpen)}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-400 italic"
        >
          <span>{thinkingOpen ? '▼' : '▶'}</span>
          <span>Thinking…</span>
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

  // tool_result: skip (shown inside assistant via toolResultMap)
  return null;
}

function RichText({ text }: { text: string }) {
  const segments = parseSegments(text);

  return (
    <div className="space-y-2">
      {segments.map((seg, i) => {
        if (seg.kind === 'text') {
          return seg.content.trim() ? (
            <div key={i} className="whitespace-pre-wrap break-words">
              {seg.content}
            </div>
          ) : null;
        }
        // code fence → Monaco
        const code = seg.content;
        const lang = seg.lang === '' ? 'plaintext' : seg.lang;
        return (
          <div key={i} className="rounded overflow-hidden border border-gray-700">
            {seg.lang && (
              <div className="px-3 py-1 text-xs text-gray-500 bg-[#1c2128] border-b border-gray-700 font-mono">
                {seg.lang}
              </div>
            )}
            <MonacoCode
              code={code}
              language={lang}
              height={editorHeight(code, 48, 400)}
            />
          </div>
        );
      })}
    </div>
  );
}
