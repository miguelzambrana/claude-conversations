import { useState } from 'react';
import type { ToolUseBlock, ToolResultBlock } from '../lib/types.ts';
import CodeDiffViewer from './CodeDiffViewer.tsx';
import MonacoCode from './MonacoCode.tsx';
import { detectLanguage, editorHeight } from './MonacoCode.tsx';

interface Props {
  toolUse: ToolUseBlock;
  toolResult?: ToolResultBlock;
}

const TOOL_META: Record<string, { icon: string; color: string; bg: string; border: string }> = {
  Read:       { icon: '📄', color: '#58A6FF', bg: '#0d1b2e', border: '#1f3a5f' },
  Edit:       { icon: '✏️',  color: '#D29922', bg: '#1f1a0a', border: '#5a4a10' },
  Bash:       { icon: '💻', color: '#F78166', bg: '#1f0d0a', border: '#5a2010' },
  Write:      { icon: '📝', color: '#3FB950', bg: '#0a1f10', border: '#155224' },
  Grep:       { icon: '🔍', color: '#8B949E', bg: '#161b22', border: '#30363d' },
  Glob:       { icon: '🗂️', color: '#8B949E', bg: '#161b22', border: '#30363d' },
  TaskCreate: { icon: '✅', color: '#BC8CFF', bg: '#1a0f2e', border: '#4a2f7f' },
  TaskUpdate: { icon: '🔄', color: '#BC8CFF', bg: '#1a0f2e', border: '#4a2f7f' },
  TaskList:   { icon: '📋', color: '#BC8CFF', bg: '#1a0f2e', border: '#4a2f7f' },
  TaskGet:    { icon: '📋', color: '#BC8CFF', bg: '#1a0f2e', border: '#4a2f7f' },
  Agent:      { icon: '🤖', color: '#39D353', bg: '#0a1f15', border: '#1a5225' },
};

function getMeta(name: string) {
  return TOOL_META[name] ?? { icon: '🔧', color: '#8B949E', bg: '#161b22', border: '#30363d' };
}

function getResultText(result?: ToolResultBlock): string {
  if (!result) return '';
  if (typeof result.content === 'string') return result.content;
  return result.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('\n');
}

function getToolSummary(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case 'Edit':
    case 'Write':
    case 'Read':
      return typeof input.file_path === 'string' ? input.file_path : '';
    case 'Bash':
      return typeof input.command === 'string' ? (input.command as string).slice(0, 80) : '';
    case 'Grep':
      return typeof input.pattern === 'string' ? `/${input.pattern}/` : '';
    case 'Glob':
      return typeof input.pattern === 'string' ? input.pattern as string : '';
    case 'Agent':
      return typeof input.description === 'string' ? input.description as string : '';
    default:
      return '';
  }
}

export default function ToolCallBlock({ toolUse, toolResult }: Props) {
  const [open, setOpen] = useState(false);
  const meta = getMeta(toolUse.name);
  const input = toolUse.input as Record<string, unknown>;
  const isEdit = toolUse.name === 'Edit';
  const isWrite = toolUse.name === 'Write';
  const isBash = toolUse.name === 'Bash';
  const isRead = toolUse.name === 'Read';
  const resultText = getResultText(toolResult);
  const hasError = toolResult?.is_error;
  const summary = getToolSummary(toolUse.name, input);

  // Detect language for code display
  const filePath = typeof input.file_path === 'string' ? input.file_path : '';

  return (
    <div
      className="rounded-md my-1 overflow-hidden"
      style={{ borderWidth: 1, borderStyle: 'solid', borderColor: meta.border, backgroundColor: meta.bg }}
    >
      {/* Header button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-left transition-opacity hover:opacity-80"
      >
        <span>{meta.icon}</span>
        <span className="font-mono font-semibold" style={{ color: meta.color }}>
          {toolUse.name}
        </span>
        {summary && (
          <span className="ml-1 truncate font-mono text-gray-400 text-xs">{summary}</span>
        )}
        {hasError && <span className="ml-auto mr-2 text-red-400 font-semibold">Error</span>}
        <span className="ml-auto flex-shrink-0 text-gray-500 text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="border-t" style={{ borderColor: meta.border }}>
          {(isEdit || isWrite) ? (
            <CodeDiffViewer
              filePath={filePath}
              oldString={typeof input.old_string === 'string' ? input.old_string : undefined}
              newString={
                typeof input.new_string === 'string'
                  ? input.new_string
                  : typeof input.content === 'string'
                  ? input.content
                  : undefined
              }
              mode={isWrite ? 'write' : 'diff'}
            />
          ) : isBash ? (
            <BashContent
              command={typeof input.command === 'string' ? input.command : ''}
              output={resultText}
              hasError={!!hasError}
            />
          ) : isRead && resultText ? (
            <ReadContent filePath={filePath} content={resultText} />
          ) : (
            <GenericContent input={input} resultText={resultText} hasError={!!hasError} />
          )}
        </div>
      )}
    </div>
  );
}

// Bash: show command + output in Monaco
function BashContent({ command, output, hasError }: { command: string; output: string; hasError: boolean }) {
  return (
    <div>
      <div className="border-b border-gray-800 bg-[#0d1117]">
        <div className="px-3 py-1 text-xs text-gray-500 uppercase tracking-wider">Command</div>
        <MonacoCode
          code={command}
          language="shell"
          height={editorHeight(command, 48, 150)}
        />
      </div>
      {output && (
        <div>
          <div className={`px-3 py-1 text-xs uppercase tracking-wider ${hasError ? 'text-red-400' : 'text-gray-500'}`}>
            {hasError ? 'Error Output' : 'Output'}
          </div>
          <MonacoCode
            code={output}
            language="plaintext"
            height={editorHeight(output, 48, 400)}
          />
        </div>
      )}
    </div>
  );
}

// Read: show file content in Monaco
function ReadContent({ filePath, content }: { filePath: string; content: string }) {
  return (
    <MonacoCode
      code={content}
      filePath={filePath}
      height={editorHeight(content, 80, 500)}
    />
  );
}

// Generic: JSON input + text result
function GenericContent({
  input,
  resultText,
  hasError,
}: {
  input: Record<string, unknown>;
  resultText: string;
  hasError: boolean;
}) {
  const inputJson = JSON.stringify(input, null, 2);
  return (
    <div>
      <div className="px-3 py-1 text-xs text-gray-500 uppercase tracking-wider">Input</div>
      <MonacoCode
        code={inputJson}
        language="json"
        height={editorHeight(inputJson, 48, 300)}
      />
      {resultText && (
        <>
          <div className={`px-3 py-1 text-xs uppercase tracking-wider border-t border-gray-800 ${hasError ? 'text-red-400' : 'text-gray-500'}`}>
            {hasError ? 'Error' : 'Result'}
          </div>
          <MonacoCode
            code={resultText.slice(0, 5000) + (resultText.length > 5000 ? '\n… (truncated)' : '')}
            language="plaintext"
            height={editorHeight(resultText.slice(0, 5000), 48, 400)}
          />
        </>
      )}
    </div>
  );
}
