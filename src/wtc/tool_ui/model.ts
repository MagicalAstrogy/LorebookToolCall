import _ from 'lodash';
import type { ToolErrorResult } from '@/wtc/result';
import { KNOWN_TOOL_NAMES, type CodeLine, type GrepContentGroup, type RawToolInvocation, type ToolCallBlockModel, type ToolCallRecord } from '@/wtc/tool_ui/types';

const KNOWN_TOOL_NAME_SET = new Set<string>(KNOWN_TOOL_NAMES);

function isPlainObject(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toToolError(result: unknown): ToolErrorResult | undefined {
  if (!isPlainObject(result) || result.is_error !== true) {
    return undefined;
  }
  if (typeof result.errorType !== 'string' || typeof result.message !== 'string') {
    return undefined;
  }
  return result as ToolErrorResult;
}

export function prettyJson(value: unknown) {
  return JSON.stringify(value, null, 2) ?? String(value);
}

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  const text = value.trim();
  if (!text) {
    return value;
  }

  if (!['{', '[', '"'].includes(text[0]) && text !== 'true' && text !== 'false' && text !== 'null' && !/^[-\d]/.test(text)) {
    return value;
  }

  try {
    return JSON.parse(text);
  } catch {
    return value;
  }
}

export function normalizeToolInvocation(raw: unknown, index: number): ToolCallRecord {
  const record = isPlainObject(raw) ? (raw as RawToolInvocation) : {};
  const name = typeof record.name === 'string' && record.name ? record.name : typeof record.displayName === 'string' ? record.displayName : 'UnknownTool';
  const kind = KNOWN_TOOL_NAME_SET.has(name) ? (name as ToolCallRecord['kind']) : 'unknown';
  const parsedParameters = parseMaybeJson(record.parameters);
  const parameters = isPlainObject(parsedParameters) ? parsedParameters : {};
  const result = parseMaybeJson(record.result) ?? null;
  const prettyRaw = prettyJson({
    ...record,
    parameters,
    result,
  });

  return {
    key: `${name}-${record.id ?? index}`,
    id: typeof record.id === 'string' ? record.id : `${name}-${index}`,
    name,
    displayName: typeof record.displayName === 'string' && record.displayName ? record.displayName : name,
    kind,
    isKnown: kind !== 'unknown',
    parameters,
    result,
    error: toToolError(result),
    signature: typeof record.signature === 'string' ? record.signature : undefined,
    raw: record,
    prettyRaw,
  };
}

export function normalizeToolCallBlock(messageId: number, blockKey: string, invocations: unknown[]): ToolCallBlockModel {
  return {
    key: blockKey,
    messageId,
    records: invocations.map(normalizeToolInvocation),
  };
}

export function hasKnownTool(invocations: unknown[]) {
  return invocations.some(raw => normalizeToolInvocation(raw, 0).isKnown);
}

export function parseInvocationArrayText(text: string): unknown[] | null {
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function areInvocationSetsEquivalent(lhs: unknown[], rhs: unknown[]) {
  // DOM 中的 code block 可能经过 prettify，比较时只看稳定 id，避免被格式差异干扰。
  const normalizeIds = (input: unknown[]) =>
    input
      .map((item, index) => normalizeToolInvocation(item, index))
      .map(record => record.id)
      .sort();
  return _.isEqual(normalizeIds(lhs), normalizeIds(rhs));
}

export function codeLinesFromText(text: string): CodeLine[] {
  return (text || '').split('\n').map((content, index) => ({
    lineNumber: index + 1,
    content,
    kind: 'plain' as const,
  }));
}

export function parseCatNumberedText(text: string): CodeLine[] {
  // Read 返回的是 cat -n 风格文本，这里拆成“行号列 + 内容列”给代码视图复用。
  return (text || '').split('\n').map(rawLine => {
    const match = rawLine.match(/^\s*(\d+)\t(.*)$/s);
    if (!match) {
      return { content: rawLine, kind: 'plain' as const };
    }
    return {
      lineNumber: Number(match[1]),
      content: match[2],
      kind: 'plain' as const,
    };
  });
}

export function parseGrepContent(text: string): GrepContentGroup[] {
  // Grep(content) 使用 ripgrep 风格输出，这里按文件重新分组，便于做接近代码浏览器的展示。
  const groups: GrepContentGroup[] = [];
  let current: GrepContentGroup | null = null;

  for (const rawLine of (text || '').split('\n')) {
    if (rawLine === '--') {
      current = null;
      continue;
    }

    const match = rawLine.match(/^(.*?)([:-])(\d+)\2(.*)$/s);
    if (!match) {
      if (!current) {
        current = { filePath: '结果', rows: [] };
        groups.push(current);
      }
      current.rows.push({ content: rawLine, kind: 'plain' });
      continue;
    }

    const filePath = match[1];
    const separator = match[2];
    const lineNumber = Number(match[3]);
    const content = match[4];

    if (!current || current.filePath !== filePath) {
      current = { filePath, rows: [] };
      groups.push(current);
    }

    current.rows.push({
      lineNumber,
      content,
      kind: separator === ':' ? 'match' : 'context',
    });
  }

  return groups;
}

function flattenPatchObject(
  value: unknown,
  path: string[] = [],
  rows: Array<{ path: string; value: unknown }> = [],
) {
  if (!isPlainObject(value)) {
    rows.push({ path: path.join('.'), value });
    return rows;
  }

  const entries = Object.entries(value);
  if (entries.length === 0) {
    rows.push({ path: path.join('.'), value });
    return rows;
  }

  for (const [key, child] of entries) {
    flattenPatchObject(child, [...path, key], rows);
  }
  return rows;
}

export function buildSetAttributeChangeRows(
  patch: Record<string, any>,
  rollbackPatch: Record<string, any> | undefined,
  attributes: Record<string, any> | undefined,
) {
  // SetAttribute 首版不做完整对象 diff，只列本次 patch 触达字段的 before/after。
  return flattenPatchObject(patch).map(row => ({
    path: row.path,
    before: row.path ? _.get(rollbackPatch, row.path) : rollbackPatch,
    after: row.path ? _.get(attributes, row.path) : attributes,
  }));
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toastr.success('已复制');
    return;
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', 'true');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      toastr.success('已复制');
    } catch {
      toastr.error('复制失败');
    } finally {
      document.body.removeChild(textarea);
    }
  }
}
