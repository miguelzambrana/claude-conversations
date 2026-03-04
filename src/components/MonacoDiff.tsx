import { useEffect, useRef, useState } from 'react';
import { detectLanguage, editorHeight } from './MonacoCode.tsx';

type EditorMod = typeof import('@monaco-editor/react');

// Module-level cache so re-mounts don't flash the fallback on every scroll
let _monacoCache: EditorMod | null = null;
let _monacoPromise: Promise<EditorMod> | null = null;

function loadMonaco(): Promise<EditorMod> {
  if (!_monacoPromise) {
    _monacoPromise = import('@monaco-editor/react').then(m => {
      _monacoCache = m;
      return m;
    });
  }
  return _monacoPromise;
}

interface Props {
  original: string;
  modified: string;
  filePath?: string;
  language?: string;
  height?: number | string;
  sideBySide?: boolean;
}

export default function MonacoDiff({ original, modified, filePath, language, height, sideBySide = false }: Props) {
  // Initialize immediately from cache if already loaded
  const [mod, setMod] = useState<EditorMod | null>(_monacoCache);
  const [copied, setCopied] = useState(false);
  const copyTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lang = language ?? (filePath ? detectLanguage(filePath) : 'plaintext');
  const h = height ?? editorHeight(modified || original, 100, 500);

  useEffect(() => {
    if (!_monacoCache) {
      loadMonaco().then(setMod);
    }
  }, []);

  function handleCopy() {
    navigator.clipboard.writeText(modified).then(() => {
      setCopied(true);
      if (copyTimeout.current) clearTimeout(copyTimeout.current);
      copyTimeout.current = setTimeout(() => setCopied(false), 2000);
    });
  }

  if (!mod) {
    return (
      <div className="rounded bg-[#1e1e1e] p-3 text-xs text-gray-400">
        Loading diff viewer…
      </div>
    );
  }

  const DiffEditor = mod.DiffEditor;
  return (
    <div className="relative group">
      <button
        onClick={handleCopy}
        title="Copy modified content"
        className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity
          bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white
          rounded px-2 py-0.5 text-xs font-mono select-none"
      >
        {copied ? 'Copied!' : 'Copy'}
      </button>
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
    </div>
  );
}
