import { useEffect, useState } from 'react';

type EditorMod = typeof import('@monaco-editor/react');

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
  const [mod, setMod] = useState<EditorMod | null>(null);
  const lang = language ?? (filePath ? detectLanguage(filePath) : 'plaintext');
  const h = height ?? editorHeight(code);

  useEffect(() => {
    import('@monaco-editor/react').then(setMod);
  }, []);

  if (!mod) {
    return (
      <pre
        className="overflow-x-auto overflow-y-auto rounded bg-[#1e1e1e] px-4 py-3 text-xs text-gray-300 font-mono"
        style={{ height: typeof h === 'number' ? h : undefined, maxHeight: 500 }}
      >
        {code}
      </pre>
    );
  }

  const Editor = mod.default;
  return (
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
  );
}
