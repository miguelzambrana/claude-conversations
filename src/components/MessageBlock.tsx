import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Message, ToolUseBlock, ToolResultBlock, ContentBlock } from '../lib/types.ts';
import ToolCallBlock from './ToolCallBlock.tsx';
import MonacoCode from './MonacoCode.tsx';
import { editorHeight } from './MonacoCode.tsx';

interface Props {
  message: Message;
  nextMessage?: Message;
  isMatch?: boolean;
  isActiveMatch?: boolean;
}

function formatTime(d: Date | string): string {
  return new Date(d).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

export default function MessageBlock({ message, nextMessage, isMatch, isActiveMatch }: Props) {
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
    const hasOnlyToolResults =
      message.content.length > 0 && message.content.every((b) => b.type === 'tool_result');
    if (hasOnlyToolResults) return null;
  }

  // Highlight ring styles
  const ringStyle = isActiveMatch
    ? 'ring-2 ring-yellow-400 shadow-lg shadow-yellow-500/20'
    : isMatch
    ? 'ring-1 ring-yellow-600/60'
    : '';

  return (
    <div id={message.uuid} className={`flex gap-3 scroll-mt-20 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
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
          {message.usage && (
            <span className="ml-2 text-gray-600">
              ↑{message.usage.input_tokens.toLocaleString()} ↓{message.usage.output_tokens.toLocaleString()}
              {message.usage.cache_read_input_tokens > 0 && (
                <span className="text-green-800 ml-1">
                  ⚡{message.usage.cache_read_input_tokens.toLocaleString()}
                </span>
              )}
            </span>
          )}
        </div>

        <div
          className={`rounded-lg px-4 py-3 text-sm leading-relaxed w-full transition-all ${ringStyle} ${
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
              isUser={isUser}
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
  isUser: boolean;
}

function ContentRenderer({ block, toolResultMap, thinkingOpen, setThinkingOpen, isUser }: ContentRendererProps) {
  if (block.type === 'text') {
    if (!block.text.trim()) return null;
    // User messages: preserve plain text. Assistant messages: render markdown.
    return isUser ? (
      <div className="whitespace-pre-wrap break-words">{block.text}</div>
    ) : (
      <MarkdownContent text={block.text} />
    );
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

  return null;
}

// ─── Markdown renderer ────────────────────────────────────────────────────────

// Hoisted outside the component so the object reference is stable across renders.
// If components is recreated every render, ReactMarkdown remounts all children
// (including Monaco editors), causing the scroll glitch.
const MARKDOWN_COMPONENTS = {
  code({ className, children, ...props }: any) {
    const match = /language-(\w+)/.exec(className ?? '');
    const lang = match?.[1] ?? 'plaintext';
    const code = String(children).replace(/\n$/, '');
    const isBlock = code.includes('\n') || !!match;
    if (isBlock) {
      return (
        <div className="my-2 rounded overflow-hidden border border-gray-700">
          {lang !== 'plaintext' && (
            <div className="px-3 py-1 text-xs text-gray-500 bg-[#1c2128] border-b border-gray-700 font-mono">
              {lang}
            </div>
          )}
          <MonacoCode code={code} language={lang} height={editorHeight(code, 48, 400)} />
        </div>
      );
    }
    return (
      <code
        className="rounded bg-gray-800 px-1 py-0.5 text-xs font-mono text-gray-200"
        {...props}
      >
        {children}
      </code>
    );
  },
  p({ children }: any) {
    return <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>;
  },
  h1({ children }: any) { return <h1 className="text-base font-bold text-gray-100 mt-3 mb-1">{children}</h1>; },
  h2({ children }: any) { return <h2 className="text-sm font-bold text-gray-100 mt-3 mb-1">{children}</h2>; },
  h3({ children }: any) { return <h3 className="text-sm font-semibold text-gray-200 mt-2 mb-1">{children}</h3>; },
  ul({ children }: any) { return <ul className="list-disc list-inside mb-2 space-y-0.5 text-gray-300">{children}</ul>; },
  ol({ children }: any) { return <ol className="list-decimal list-inside mb-2 space-y-0.5 text-gray-300">{children}</ol>; },
  li({ children }: any) { return <li className="leading-relaxed">{children}</li>; },
  strong({ children }: any) { return <strong className="font-semibold text-gray-100">{children}</strong>; },
  em({ children }: any) { return <em className="italic text-gray-300">{children}</em>; },
  a({ href, children }: any) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-400 underline hover:text-blue-300"
      >
        {children}
      </a>
    );
  },
  blockquote({ children }: any) {
    return (
      <blockquote className="border-l-2 border-gray-600 pl-3 my-2 text-gray-400 italic">
        {children}
      </blockquote>
    );
  },
  hr() { return <hr className="my-3 border-gray-700" />; },
  table({ children }: any) {
    return (
      <div className="my-2 overflow-x-auto">
        <table className="w-full text-xs border-collapse border border-gray-700">{children}</table>
      </div>
    );
  },
  thead({ children }: any) { return <thead className="bg-gray-800">{children}</thead>; },
  th({ children }: any) {
    return <th className="border border-gray-700 px-2 py-1 text-left text-gray-300 font-semibold">{children}</th>;
  },
  td({ children }: any) {
    return <td className="border border-gray-700 px-2 py-1 text-gray-400">{children}</td>;
  },
  input({ type, checked }: any) {
    if (type === 'checkbox') {
      return (
        <input
          type="checkbox"
          checked={checked}
          readOnly
          className="mr-1.5 accent-blue-500"
        />
      );
    }
    return null;
  },
};

function MarkdownContent({ text }: { text: string }) {
  return (
    <div className="prose-custom">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={MARKDOWN_COMPONENTS}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
