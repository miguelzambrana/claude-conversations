import { useMemo } from 'react';
import * as Diff from 'diff';

interface Props {
  filePath: string;
  oldString?: string;
  newString?: string;
  mode?: 'diff' | 'write';
}

export default function CodeDiffViewer({ filePath, oldString, newString, mode = 'diff' }: Props) {
  const diffLines = useMemo(() => {
    if (mode === 'write') {
      return (newString ?? '').split('\n').map((line) => ({ type: 'added', value: line }));
    }
    const changes = Diff.diffLines(oldString ?? '', newString ?? '');
    const lines: { type: 'normal' | 'added' | 'removed'; value: string }[] = [];
    for (const change of changes) {
      const type = change.added ? 'added' : change.removed ? 'removed' : 'normal';
      const lineArr = change.value.split('\n');
      // remove trailing empty from split
      if (lineArr[lineArr.length - 1] === '') lineArr.pop();
      for (const line of lineArr) {
        lines.push({ type, value: line });
      }
    }
    return lines;
  }, [oldString, newString, mode]);

  const addedCount = diffLines.filter((l) => l.type === 'added').length;
  const removedCount = diffLines.filter((l) => l.type === 'removed').length;

  return (
    <div className="overflow-hidden rounded-md border border-gray-700 text-xs font-mono">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-700 bg-[#1c2128] px-3 py-1.5">
        <span className="text-gray-300 truncate">{filePath}</span>
        <div className="flex gap-2 text-xs flex-shrink-0 ml-2">
          {addedCount > 0 && <span className="text-green-400">+{addedCount}</span>}
          {removedCount > 0 && <span className="text-red-400">-{removedCount}</span>}
        </div>
      </div>

      {/* Diff lines */}
      <div className="overflow-x-auto max-h-96">
        <table className="w-full border-collapse">
          <tbody>
            {diffLines.map((line, i) => {
              const bg =
                line.type === 'added'
                  ? 'bg-green-950'
                  : line.type === 'removed'
                  ? 'bg-red-950'
                  : '';
              const marker =
                line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' ';
              const textColor =
                line.type === 'added'
                  ? 'text-green-300'
                  : line.type === 'removed'
                  ? 'text-red-300'
                  : 'text-gray-300';
              return (
                <tr key={i} className={bg}>
                  <td className={`select-none w-4 px-2 text-center ${textColor} opacity-60 border-r border-gray-700`}>
                    {marker}
                  </td>
                  <td className={`px-3 py-0 whitespace-pre ${textColor}`}>
                    {line.value || ' '}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
