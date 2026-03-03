import { useEffect, useState, useCallback } from 'react';
import MonacoDiff from './MonacoDiff.tsx';
import { detectLanguage } from './MonacoCode.tsx';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Commit {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  email: string;
  relativeTime: string;
  isoTime: string;
}

interface CommitFile {
  path: string;
  added: number;
  removed: number;
  status: 'modified' | 'added' | 'deleted' | 'renamed';
}

interface FileDiff {
  old: string;
  new: string;
}

// ─── GitKraken color palette ──────────────────────────────────────────────────

const GK_COLORS = [
  '#3FB950', // green
  '#58A6FF', // blue
  '#D29922', // amber
  '#F78166', // salmon
  '#BC8CFF', // purple
  '#39D353', // bright green
  '#E3B341', // yellow
  '#FF7B72', // red-orange
];

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  cwd: string;
  branch?: string | null;
}

export default function GitCommitPanel({ cwd, branch }: Props) {
  const [commits, setCommits] = useState<Commit[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedHash, setSelectedHash] = useState<string | null>(null);

  useEffect(() => {
    if (!cwd) { setLoading(false); return; }
    fetch(`/api/git/commits?path=${encodeURIComponent(cwd)}`)
      .then((r) => r.json())
      .then((d) => { setCommits(d.commits ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [cwd]);

  if (!cwd) {
    return (
      <div className="gk-panel flex items-center justify-center h-32 text-sm text-[#636e7b]">
        No repository path
      </div>
    );
  }

  return (
    <div
      className="gk-panel flex flex-col rounded-lg overflow-hidden"
      style={{ background: '#1B1F23', border: '1px solid #2d333b', minHeight: 200 }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 select-none"
        style={{ background: '#141618', borderBottom: '1px solid #2d333b' }}
      >
        <GitIcon />
        <span className="text-xs font-semibold text-[#cdd9e5] tracking-wide">GIT HISTORY</span>
        {branch && (
          <span
            className="ml-auto text-xs font-mono px-2 py-0.5 rounded-full"
            style={{ background: '#212830', color: '#3FB950', border: '1px solid #1a4226' }}
          >
            {branch}
          </span>
        )}
      </div>

      {/* Commit list */}
      <div className="flex-1 overflow-y-auto" style={{ maxHeight: 420 }}>
        {loading && (
          <div className="flex items-center justify-center py-8 text-xs text-[#636e7b]">
            Loading commits…
          </div>
        )}
        {!loading && commits.length === 0 && (
          <div className="flex items-center justify-center py-8 text-xs text-[#636e7b]">
            No commits found
          </div>
        )}
        {commits.map((commit, i) => (
          <CommitRow
            key={commit.hash}
            commit={commit}
            index={i}
            isSelected={selectedHash === commit.hash}
            onClick={() => setSelectedHash(commit.hash === selectedHash ? null : commit.hash)}
          />
        ))}
      </div>

      {/* Commit detail modal */}
      {selectedHash && (
        <CommitModal
          hash={selectedHash}
          cwd={cwd}
          commit={commits.find((c) => c.hash === selectedHash) ?? null}
          onClose={() => setSelectedHash(null)}
        />
      )}
    </div>
  );
}

// ─── Commit row ───────────────────────────────────────────────────────────────

function CommitRow({
  commit,
  index,
  isSelected,
  onClick,
}: {
  commit: Commit;
  index: number;
  isSelected: boolean;
  onClick: () => void;
}) {
  const color = GK_COLORS[index % GK_COLORS.length];

  return (
    <button
      onClick={onClick}
      className="w-full text-left flex items-stretch group"
      style={{
        background: isSelected ? 'rgba(88,166,255,0.08)' : 'transparent',
        borderBottom: '1px solid #2d333b',
        borderLeft: isSelected ? `2px solid ${color}` : '2px solid transparent',
        transition: 'background 0.1s',
      }}
      onMouseEnter={(e) => {
        if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)';
      }}
      onMouseLeave={(e) => {
        if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent';
      }}
    >
      {/* Graph column */}
      <div className="flex flex-col items-center w-8 py-0 flex-shrink-0">
        <div className="flex-1 w-px" style={{ background: '#2d333b' }} />
        <div
          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
          style={{
            border: `2px solid ${color}`,
            background: isSelected ? color : '#1B1F23',
            boxShadow: isSelected ? `0 0 6px ${color}66` : 'none',
          }}
        />
        <div className="flex-1 w-px" style={{ background: '#2d333b' }} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 py-2 pr-3">
        <p className="text-xs text-[#cdd9e5] truncate leading-tight">{commit.message}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="font-mono text-xs" style={{ color }}>
            {commit.shortHash}
          </span>
          <span className="text-xs text-[#636e7b] truncate">{commit.author}</span>
          <span className="text-xs text-[#444c56] ml-auto flex-shrink-0">{commit.relativeTime}</span>
        </div>
      </div>
    </button>
  );
}

// ─── Commit detail modal ───────────────────────────────────────────────────────

function CommitModal({
  hash,
  cwd,
  commit,
  onClose,
}: {
  hash: string;
  cwd: string;
  commit: Commit | null;
  onClose: () => void;
}) {
  const [files, setFiles] = useState<CommitFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileDiff, setFileDiff] = useState<FileDiff | null>(null);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [loadingDiff, setLoadingDiff] = useState(false);

  useEffect(() => {
    setLoadingFiles(true);
    setFiles([]);
    setSelectedFile(null);
    setFileDiff(null);
    fetch(`/api/git/commit?path=${encodeURIComponent(cwd)}&hash=${hash}`)
      .then((r) => r.json())
      .then((d) => { setFiles(d.files ?? []); setLoadingFiles(false); })
      .catch(() => setLoadingFiles(false));
  }, [hash, cwd]);

  const selectFile = useCallback(
    async (filePath: string) => {
      setSelectedFile(filePath);
      setFileDiff(null);
      setLoadingDiff(true);
      try {
        const r = await fetch(
          `/api/git/file?path=${encodeURIComponent(cwd)}&hash=${hash}&file=${encodeURIComponent(filePath)}`
        );
        const d: FileDiff = await r.json();
        setFileDiff(d);
      } finally {
        setLoadingDiff(false);
      }
    },
    [cwd, hash]
  );

  // ESC to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(2px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-6xl flex flex-col rounded-xl overflow-hidden"
        style={{
          background: '#1B1F23',
          border: '1px solid #373e47',
          boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
          maxHeight: '90vh',
        }}
      >
        {/* Modal header */}
        <div
          className="flex items-center gap-3 px-5 py-3 flex-shrink-0"
          style={{ background: '#141618', borderBottom: '1px solid #2d333b' }}
        >
          <GitIcon />
          {commit && (
            <>
              <span className="font-mono text-xs" style={{ color: '#58A6FF' }}>
                {commit.shortHash}
              </span>
              <span className="text-sm text-[#cdd9e5] flex-1 truncate font-medium">
                {commit.message}
              </span>
              <span className="text-xs text-[#636e7b] flex-shrink-0">
                {commit.author} · {commit.relativeTime}
              </span>
            </>
          )}
          <button
            onClick={onClose}
            className="flex-shrink-0 w-6 h-6 rounded flex items-center justify-center text-[#636e7b] hover:text-[#cdd9e5] hover:bg-white/10 transition-colors ml-2"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0">
          {/* File list sidebar */}
          <div
            className="flex-shrink-0 flex flex-col overflow-hidden"
            style={{ width: 280, borderRight: '1px solid #2d333b', background: '#161b22' }}
          >
            <div
              className="px-3 py-2 text-xs text-[#8b949e] uppercase tracking-wider font-semibold flex-shrink-0"
              style={{ borderBottom: '1px solid #2d333b' }}
            >
              {loadingFiles ? 'Loading…' : `${files.length} file${files.length !== 1 ? 's' : ''} changed`}
            </div>
            <div className="flex-1 overflow-y-auto">
              {files.map((f) => (
                <FileRow
                  key={f.path}
                  file={f}
                  isSelected={selectedFile === f.path}
                  onClick={() => selectFile(f.path)}
                />
              ))}
            </div>
          </div>

          {/* Diff pane */}
          <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
            {!selectedFile && (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <div className="text-[#636e7b] text-sm mb-1">Select a file to view changes</div>
                  <div className="text-[#444c56] text-xs">{files.length} file{files.length !== 1 ? 's' : ''} changed</div>
                </div>
              </div>
            )}
            {selectedFile && (
              <>
                <div
                  className="px-4 py-2 flex-shrink-0 flex items-center gap-2 text-xs font-mono"
                  style={{ background: '#141618', borderBottom: '1px solid #2d333b' }}
                >
                  <FileStatusBadge status={files.find((f) => f.path === selectedFile)?.status ?? 'modified'} />
                  <span className="text-[#58A6FF]">{selectedFile}</span>
                </div>
                <div className="flex-1 overflow-auto">
                  {loadingDiff && (
                    <div className="flex items-center justify-center h-full text-xs text-[#636e7b]">
                      Loading diff…
                    </div>
                  )}
                  {!loadingDiff && fileDiff && (
                    <MonacoDiff
                      original={fileDiff.old}
                      modified={fileDiff.new}
                      filePath={selectedFile}
                      language={detectLanguage(selectedFile)}
                      height="100%"
                      sideBySide={true}
                    />
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── File row in sidebar ──────────────────────────────────────────────────────

function FileRow({
  file,
  isSelected,
  onClick,
}: {
  file: CommitFile;
  isSelected: boolean;
  onClick: () => void;
}) {
  const name = file.path.split('/').pop() ?? file.path;
  const dir = file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : '';

  return (
    <button
      onClick={onClick}
      className="w-full text-left px-3 py-2 flex items-start gap-2 group"
      style={{
        background: isSelected ? 'rgba(88,166,255,0.1)' : 'transparent',
        borderBottom: '1px solid #1f2428',
        borderLeft: isSelected ? '2px solid #58A6FF' : '2px solid transparent',
        transition: 'background 0.1s',
      }}
      onMouseEnter={(e) => {
        if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)';
      }}
      onMouseLeave={(e) => {
        if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent';
      }}
    >
      <FileStatusBadge status={file.status} compact />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-[#cdd9e5] truncate">{name}</p>
        {dir && <p className="text-xs text-[#444c56] truncate">{dir}</p>}
        <div className="flex gap-1.5 mt-0.5">
          {file.added > 0 && (
            <span className="text-xs font-mono" style={{ color: '#3FB950' }}>
              +{file.added}
            </span>
          )}
          {file.removed > 0 && (
            <span className="text-xs font-mono" style={{ color: '#F85149' }}>
              -{file.removed}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function FileStatusBadge({
  status,
  compact = false,
}: {
  status: CommitFile['status'];
  compact?: boolean;
}) {
  const map = {
    modified: { label: 'M', color: '#D29922', bg: '#2d2208' },
    added:    { label: 'A', color: '#3FB950', bg: '#0a1f10' },
    deleted:  { label: 'D', color: '#F85149', bg: '#2d0a0a' },
    renamed:  { label: 'R', color: '#BC8CFF', bg: '#1a0f2e' },
  };
  const s = map[status] ?? map.modified;
  return (
    <span
      className="flex-shrink-0 flex items-center justify-center rounded text-xs font-bold font-mono"
      style={{
        width: compact ? 16 : 18,
        height: compact ? 16 : 18,
        color: s.color,
        background: s.bg,
        border: `1px solid ${s.color}33`,
      }}
    >
      {s.label}
    </span>
  );
}

function GitIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#636e7b' }}>
      <path d="M2.6 10.59L8.38 4.8l1.69 1.7c-.24.85.15 1.78.93 2.23v5.54c-.6.34-1 .99-1 1.73a2 2 0 002 2 2 2 0 002-2c0-.74-.4-1.39-1-1.73V9.41l2.07 2.09c-.07.15-.07.32-.07.5a2 2 0 002 2 2 2 0 002-2 2 2 0 00-2-2c-.18 0-.35 0-.5.07L13.93 7.5A2 2 0 0012 4a2.002 2.002 0 00-1.95 2.45L8.38 4.8 2.6 10.59z" />
    </svg>
  );
}
