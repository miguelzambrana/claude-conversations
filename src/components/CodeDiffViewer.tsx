import MonacoDiff from './MonacoDiff.tsx';
import MonacoCode from './MonacoCode.tsx';
import { editorHeight } from './MonacoCode.tsx';

interface Props {
  filePath: string;
  oldString?: string;
  newString?: string;
  mode?: 'diff' | 'write';
}

export default function CodeDiffViewer({ filePath, oldString, newString, mode = 'diff' }: Props) {
  const isWrite = mode === 'write';
  const content = newString ?? '';
  const original = oldString ?? '';

  return (
    <div className="overflow-hidden rounded-md border border-gray-700">
      {/* File header */}
      <div className="flex items-center justify-between border-b border-gray-700 bg-[#1c2128] px-3 py-1.5 text-xs font-mono">
        <span className="text-gray-300 truncate">{filePath}</span>
        <span className="flex-shrink-0 ml-2 text-gray-500">
          {isWrite ? '(new file)' : 'diff'}
        </span>
      </div>

      {isWrite ? (
        <MonacoCode
          code={content}
          filePath={filePath}
          height={editorHeight(content, 80, 500)}
        />
      ) : (
        <MonacoDiff
          original={original}
          modified={content}
          filePath={filePath}
          height={editorHeight(Math.max(original.length, content.length) > 0
            ? (original + '\n' + content)
            : '', 100, 500)}
          sideBySide={false}
        />
      )}
    </div>
  );
}
