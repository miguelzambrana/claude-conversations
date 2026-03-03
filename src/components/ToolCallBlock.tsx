import { useState } from 'react';
import type { ToolUseBlock, ToolResultBlock } from '../lib/types.ts';
import CodeDiffViewer from './CodeDiffViewer.tsx';

interface Props {
  toolUse: ToolUseBlock;
  toolResult?: ToolResultBlock;
}

const TOOL_STYLES: Record<string, { icon: string; label: string; badgeClass: string }> = {
  Read:       { icon: '📄', label: 'Read',       badgeClass: 'bg-blue-900 text-blue-300 border-blue-700' },
  Edit:       { icon: '✏️',  label: 'Edit',       badgeClass: 'bg-yellow-900 text-yellow-300 border-yellow-700' },
  Bash:       { icon: '💻', label: 'Bash',       badgeClass: 'bg-red-900 text-red-300 border-red-700' },
  Write:      { icon: '📝', label: 'Write',      badgeClass: 'bg-green-900 text-green-300 border-green-700' },
  Grep:       { icon: '🔍', label: 'Grep',       badgeClass: 'bg-gray-700 text-gray-300 border-gray-600' },
  Glob:       { icon: '🗂️', label: 'Glob',       badgeClass: 'bg-gray-700 text-gray-300 border-gray-600' },
  TaskCreate: { icon: '✅', label: 'TaskCreate', badgeClass: 'bg-purple-900 text-purple-300 border-purple-700' },
  TaskUpdate: { icon: '🔄', label: 'TaskUpdate', badgeClass: 'bg-purple-900 text-purple-300 border-purple-700' },
  TaskList:   { icon: '📋', label: 'TaskList',   badgeClass: 'bg-purple-900 text-purple-300 border-purple-700' },
  TaskGet:    { icon: '📋', label: 'TaskGet',    badgeClass: 'bg-purple-900 text-purple-300 border-purple-700' },
  Agent:      { icon: '🤖', label: 'Agent',      badgeClass: 'bg-indigo-900 text-indigo-300 border-indigo-700' },
};

function getToolStyle(name: string) {
  return TOOL_STYLES[name] ?? { icon: '🔧', label: name, badgeClass: 'bg-gray-700 text-gray-300 border-gray-600' };
}

function getResultText(result?: ToolResultBlock): string {
  if (!result) return '';
  if (typeof result.content === 'string') return result.content;
  const parts: string[] = [];
  for (const block of result.content) {
    if (block.type === 'text') parts.push(block.text);
  }
  return parts.join('\n');
}

export default function ToolCallBlock({ toolUse, toolResult }: Props) {
  const [open, setOpen] = useState(false);
  const style = getToolStyle(toolUse.name);
  const input = toolUse.input as Record<string, unknown>;
  const isEdit = toolUse.name === 'Edit';
  const isWrite = toolUse.name === 'Write';
  const resultText = getResultText(toolResult);
  const hasError = toolResult?.is_error;

  return (
    <div className={`rounded-md border my-1 overflow-hidden ${style.badgeClass.includes('border-') ? '' : 'border-gray-700'}`}
         style={{ borderColor: undefined }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-left hover:opacity-90 transition-opacity rounded-t-md border ${style.badgeClass}`}
      >
        <span>{style.icon}</span>
        <span className="font-mono font-semibold">{style.label}</span>
        {(isEdit || isWrite) && typeof input.file_path === 'string' && (
          <span className="ml-1 text-gray-400 truncate">{input.file_path as string}</span>
        )}
        {toolUse.name === 'Bash' && typeof input.command === 'string' && (
          <span className="ml-1 text-gray-400 truncate font-mono">{(input.command as string).slice(0, 60)}</span>
        )}
        {toolUse.name === 'Read' && typeof input.file_path === 'string' && (
          <span className="ml-1 text-gray-400 truncate">{input.file_path as string}</span>
        )}
        {toolUse.name === 'Grep' && typeof input.pattern === 'string' && (
          <span className="ml-1 text-gray-400 truncate font-mono">/{input.pattern as string}/</span>
        )}
        {hasError && <span className="ml-auto text-red-400">Error</span>}
        <span className="ml-auto flex-shrink-0 text-gray-400">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="border-t border-gray-700 bg-[#0d1117]">
          {(isEdit || isWrite) ? (
            <div className="p-2">
              <CodeDiffViewer
                filePath={typeof input.file_path === 'string' ? input.file_path : ''}
                oldString={typeof input.old_string === 'string' ? input.old_string : undefined}
                newString={typeof input.new_string === 'string' ? input.new_string : typeof input.content === 'string' ? input.content : undefined}
                mode={isWrite ? 'write' : 'diff'}
              />
            </div>
          ) : (
            <div className="px-3 py-2 space-y-2">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Input</p>
                <pre className="text-xs text-gray-300 whitespace-pre-wrap break-all max-h-48 overflow-y-auto">
                  {JSON.stringify(input, null, 2)}
                </pre>
              </div>
              {resultText && (
                <div>
                  <p className={`text-xs font-semibold uppercase tracking-wider mb-1 ${hasError ? 'text-red-400' : 'text-gray-500'}`}>
                    {hasError ? 'Error' : 'Result'}
                  </p>
                  <pre className={`text-xs whitespace-pre-wrap break-all max-h-64 overflow-y-auto ${hasError ? 'text-red-300' : 'text-gray-300'}`}>
                    {resultText.slice(0, 3000)}{resultText.length > 3000 ? '\n… (truncated)' : ''}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
