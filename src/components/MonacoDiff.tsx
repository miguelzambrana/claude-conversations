import { useEffect, useState } from 'react';
import { detectLanguage, editorHeight } from './MonacoCode.tsx';

type EditorMod = typeof import('@monaco-editor/react');

interface Props {
  original: string;
  modified: string;
  filePath?: string;
  language?: string;
  height?: number | string;
  sideBySide?: boolean;
}

export default function MonacoDiff({ original, modified, filePath, language, height, sideBySide = false }: Props) {
  const [mod, setMod] = useState<EditorMod | null>(null);
  const lang = language ?? (filePath ? detectLanguage(filePath) : 'plaintext');
  const h = height ?? editorHeight(modified || original, 100, 500);

  useEffect(() => {
    import('@monaco-editor/react').then(setMod);
  }, []);

  if (!mod) {
    return (
      <div className="rounded bg-[#1e1e1e] p-3 text-xs text-gray-400">
        Loading diff viewer…
      </div>
    );
  }

  const DiffEditor = mod.DiffEditor;
  return (
    <DiffEditor
      original={original}
      modified={modified}
      language={lang}
      theme="vs-dark"
      height={h}
      options={{
        readOnly: true,
        renderSideBySide: sideBySide,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        fontSize: 13,
        lineNumbers: 'on',
        folding: false,
        renderLineHighlight: 'none',
        overviewRulerLanes: 0,
        scrollbar: { alwaysConsumeMouseWheel: false },
      }}
    />
  );
}
