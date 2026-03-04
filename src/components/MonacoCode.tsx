import { useEffect, useRef, useState } from 'react';

type EditorMod = typeof import('@monaco-editor/react');

// Module-level cache so re-mounts don't flash the <pre> fallback on every scroll
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

const LANG_MAP: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
  py: 'python', rs: 'rust', go: 'go', java: 'java', sh: 'shell', bash: 'shell',
  css: 'css', scss: 'css', html: 'html', json: 'json', md: 'markdown',
  yaml: 'yaml', yml: 'yaml', toml: 'toml', sql: 'sql', astro: 'html',
  xml: 'xml', mjs: 'javascript', cjs: 'javascript', kt: 'kotlin', rb: 'ruby',
  swift: 'swift', c: 'c', cpp: 'cpp', h: 'cpp', cs: 'csharp',
};

export function detectLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  return LANG_MAP[ext] ?? 'plaintext';
}

export function editorHeight(content: string, min = 80, max = 500): number {
  const lines = content.split('\n').length;
  return Math.min(max, Math.max(min, lines * 19 + 16));
}

interface Props {
  code: string;
  language?: string;
  filePath?: string;
  height?: number | string;
  readOnly?: boolean;
}

export default function MonacoCode({ code, language, filePath, height, readOnly = true }: Props) {
  // Initialize immediately from cache if already loaded
  const [mod, setMod] = useState<EditorMod | null>(_monacoCache);
  const [copied, setCopied] = useState(false);
  const copyTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lang = language ?? (filePath ? detectLanguage(filePath) : 'plaintext');
  const h = height ?? editorHeight(code);

  useEffect(() => {
    if (!_monacoCache) {
      loadMonaco().then(setMod);
    }
  }, []);

  function handleCopy() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      if (copyTimeout.current) clearTimeout(copyTimeout.current);
      copyTimeout.current = setTimeout(() => setCopied(false), 2000);
    });
  }

  if (!mod) {
    return (
      <div className="relative group">
        <button
          onClick={handleCopy}
          title="Copy code"
          className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity
            bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white
            rounded px-2 py-0.5 text-xs font-mono select-none"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
        <pre
          className="overflow-x-auto overflow-y-auto rounded bg-[#1e1e1e] px-4 py-3 text-xs text-gray-300 font-mono"
          style={{ height: typeof h === 'number' ? h : undefined, maxHeight: 500 }}
        >
          {code}
        </pre>
      </div>
    );
  }

  const Editor = mod.default;
  return (
    <div className="relative group">
      <button
        onClick={handleCopy}
        title="Copy code"
        className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity
          bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white
          rounded px-2 py-0.5 text-xs font-mono select-none"
      >
        {copied ? 'Copied!' : 'Copy'}
      </button>
      <Editor
        value={code}
        language={lang}
        theme="vs-dark"
        height={h}
        options={{
          readOnly,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          fontSize: 13,
          lineNumbers: 'on',
          folding: true,
          wordWrap: 'off',
          renderLineHighlight: 'none',
          overviewRulerLanes: 0,
          hideCursorInOverviewRuler: true,
          scrollbar: { alwaysConsumeMouseWheel: false },
        }}
      />
    </div>
  );
}
