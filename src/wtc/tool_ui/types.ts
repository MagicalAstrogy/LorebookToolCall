import type { ToolErrorResult } from '@/wtc/result';
import type { StructuredPatch } from '@/wtc/store';

export const KNOWN_TOOL_NAMES = [
  'Glob',
  'Grep',
  'Read',
  'Write',
  'Edit',
  'Delete',
  'GetAttribute',
  'SetAttribute',
] as const;

export type KnownToolName = (typeof KNOWN_TOOL_NAMES)[number];

export type ToolInvocationResult = any;

export type RawToolInvocation = {
  id?: string;
  displayName?: string;
  name?: string;
  parameters?: Record<string, any> | string;
  result?: ToolInvocationResult;
  signature?: string;
};

export type ToolCallRecord = {
  key: string;
  id: string;
  name: string;
  displayName: string;
  kind: KnownToolName | 'unknown';
  isKnown: boolean;
  parameters: Record<string, any>;
  result: ToolInvocationResult;
  error?: ToolErrorResult;
  signature?: string;
  raw: RawToolInvocation;
  prettyRaw: string;
};

export type ToolCallBlockModel = {
  key: string;
  messageId: number;
  records: ToolCallRecord[];
};

export type CodeLine = {
  lineNumber?: number | string;
  content: string;
  kind?: 'plain' | 'context' | 'match' | 'add' | 'remove' | 'meta';
};

export type GrepContentGroup = {
  filePath: string;
  rows: CodeLine[];
};

export type DiffUnifiedRow = {
  kind: 'meta' | 'context' | 'add' | 'remove';
  oldLineNumber?: number;
  newLineNumber?: number;
  content: string;
};

export type DiffSplitRow = {
  kind: 'meta' | 'context' | 'change';
  meta?: string;
  left?: {
    lineNumber?: number;
    content: string;
    kind: 'context' | 'remove' | 'empty';
  };
  right?: {
    lineNumber?: number;
    content: string;
    kind: 'context' | 'add' | 'empty';
  };
};

export type StructuredPatchLike = StructuredPatch;
