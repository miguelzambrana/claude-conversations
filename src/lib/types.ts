export interface Project {
  id: string;
  name: string;
  path: string;
  sessionCount: number;
  lastActivity: Date;
  topTools: string[];
}

export interface Session {
  id: string;
  projectId: string;
  slug: string;
  firstMessage: string;
  timestamp: Date;
  gitBranch: string;
  messageCount: number;
  cwd: string;
}

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
}

export interface Message {
  uuid: string;
  parentUuid: string | null;
  role: 'user' | 'assistant';
  content: ContentBlock[];
  timestamp: Date;
  cwd: string;
  gitBranch: string;
  isSidechain?: boolean;
  usage?: TokenUsage;
  model?: string;
}

export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock | ThinkingBlock;

export interface TextBlock {
  type: 'text';
  text: string;
}

export interface ThinkingBlock {
  type: 'thinking';
  thinking: string;
}

export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string | ContentBlock[];
  is_error?: boolean;
}

export interface GitInfo {
  branch: string | null;
  commits: string[];
  status: string | null;
}

export interface SearchResult {
  projectId: string;
  projectName: string;
  sessionId: string;
  sessionSlug: string;
  messageUuid: string;
  excerpt: string;
  timestamp: Date;
}

// Raw JSONL line types
export interface RawMessage {
  type: 'user' | 'assistant' | 'progress' | 'file-history-snapshot' | 'system';
  uuid: string;
  parentUuid: string | null;
  sessionId: string;
  timestamp: string;
  cwd?: string;
  gitBranch?: string;
  isSidechain?: boolean;
  message?: {
    role: 'user' | 'assistant';
    content: ContentBlock[] | string;
    model?: string;
    usage?: {
      input_tokens: number;
      output_tokens: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
  };
  slug?: string;
}
