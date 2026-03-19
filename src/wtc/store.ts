import { correctlyMerge } from '@util/common';
import _ from 'lodash';
import { ToolError, invalidPathDetail } from '@/wtc/result';

export interface StructuredPatch {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
}

export interface IndexedEntry {
  filePath: string;
  entryPath: string;
  uid: number;
  raw: SillyTavern.v2DataWorldInfoEntry;
}

export interface PathIndex {
  files: IndexedEntry[];
  directories: string[];
  exactFiles: Map<string, IndexedEntry>;
  conflicts: Set<string>;
}

type RawBook = SillyTavern.v2WorldInfoBook;

const queueMap = new Map<string, Promise<void>>();

export function normalizeVirtualPath(input: string): string | null {
  if (!input.startsWith('/')) {
    return null;
  }
  const parts: string[] = [];
  for (const segment of input.split('/')) {
    if (segment === '' || segment === '.') {
      continue;
    }
    if (segment === '..') {
      if (parts.length > 0) {
        parts.pop();
      }
      continue;
    }
    parts.push(segment);
  }
  return '/' + parts.join('/');
}

export function parseVirtualPath(input: string) {
  const normalized = normalizeVirtualPath(input);
  if (!normalized) {
    throw new ToolError('InputValidationError', '路径必须是绝对路径。', [invalidPathDetail(input)]);
  }
  if (normalized === '/') {
    return { normalized, worldbookName: null, entryPath: null };
  }
  const [worldbookName, ...rest] = normalized.slice(1).split('/');
  return {
    normalized,
    worldbookName,
    entryPath: rest.length > 0 ? rest.join('/') : null,
  };
}

export function requireFileTarget(input: string) {
  const parsed = parseVirtualPath(input);
  if (!parsed.worldbookName || !parsed.entryPath) {
    throw new ToolError('InputValidationError', 'file_path 必须指向具体条目，而不是世界书根路径。', [
      invalidPathDetail(input),
    ]);
  }
  return parsed as { normalized: string; worldbookName: string; entryPath: string };
}

export async function loadRawWorldbook(worldbookName: string): Promise<RawBook> {
  const book = (await SillyTavern.loadWorldInfo(worldbookName)) as RawBook | null;
  if (!book) {
    throw new ToolError('WORLD_NOT_FOUND', `世界书 '${worldbookName}' 不存在。`);
  }
  return book;
}

export async function saveRawWorldbook(worldbookName: string, book: RawBook) {
  await SillyTavern.saveWorldInfo(worldbookName, book, true);
  SillyTavern.reloadWorldInfoEditor(worldbookName, false);
  await SillyTavern.updateWorldInfoList();
}

export async function withWorldbookQueue<T>(worldbookName: string, action: () => Promise<T>): Promise<T> {
  const previous = queueMap.get(worldbookName) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>(resolve => {
    release = resolve;
  });
  const chained = previous.then(() => current);
  queueMap.set(worldbookName, chained);

  await previous;
  try {
    return await action();
  } finally {
    release();
    if (queueMap.get(worldbookName) === chained) {
      queueMap.delete(worldbookName);
    }
  }
}

export function buildPathIndex(worldbookName: string, book: RawBook): PathIndex {
  const exactFiles = new Map<string, IndexedEntry>();
  const conflicts = new Set<string>();
  const files: IndexedEntry[] = [];
  const directories = new Set<string>([`/${worldbookName}/`]);

  for (const raw of book.entries) {
    const normalized = normalizeVirtualPath(`/${worldbookName}/${raw.comment ?? ''}`);
    if (!normalized || normalized === `/${worldbookName}`) {
      continue;
    }
    const entryPath = normalized.slice(worldbookName.length + 2);
    const indexed: IndexedEntry = {
      filePath: normalized,
      entryPath,
      uid: raw.id,
      raw,
    };
    files.push(indexed);
    if (exactFiles.has(normalized)) {
      conflicts.add(normalized);
    } else {
      exactFiles.set(normalized, indexed);
    }

    const parts = entryPath.split('/');
    for (let index = 0; index < parts.length - 1; index += 1) {
      directories.add(`/${worldbookName}/${parts.slice(0, index + 1).join('/')}/`);
    }
  }

  return {
    files,
    directories: [...directories].sort(),
    exactFiles,
    conflicts,
  };
}

export function ensureNoConflict(index: PathIndex, filePath: string) {
  if (index.conflicts.has(filePath)) {
    throw new ToolError('PATH_CONFLICT', '出现同名条目，请要求 user 变更对应条目名。');
  }
}

export function ensureDirectoryPath(index: PathIndex, directoryPath: string) {
  if (directoryPath !== '/' && !directoryPath.endsWith('/')) {
    directoryPath = `${directoryPath}/`;
  }
  if (directoryPath !== '/' && !index.directories.includes(directoryPath)) {
    throw new ToolError('ENTRY_NOT_FOUND', `目录 '${directoryPath}' 不存在。`);
  }
}

export function listCandidatesUnder(index: PathIndex, basePath: string) {
  const normalizedBase = basePath === '/' ? '/' : `${basePath.replace(/\/+$/, '')}/`;
  const candidates = new Set<string>();

  if (normalizedBase === '/') {
    for (const name of getWorldbookNames().filter(name => !name.includes('/'))) {
      candidates.add(`/${name}/`);
    }
    return [...candidates].sort();
  }

  for (const file of index.files) {
    if (file.filePath.startsWith(normalizedBase)) {
      candidates.add(file.filePath);
    }
  }
  for (const directory of index.directories) {
    if (directory !== normalizedBase && directory.startsWith(normalizedBase)) {
      candidates.add(directory);
    }
  }

  return [...candidates].sort();
}

export function basenameFromEntryPath(entryPath: string) {
  const parts = entryPath.split('/');
  return parts[parts.length - 1] || '新条目';
}

export function globToRegExp(pattern: string): RegExp {
  let source = '^';
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    const next = pattern[index + 1];
    if (char === '*') {
      if (next === '*') {
        source += '.*';
        index += 1;
      } else {
        source += '[^/]*';
      }
      continue;
    }
    if (char === '?') {
      source += '[^/]';
      continue;
    }
    if ('\\.[]{}()+-^$|'.includes(char)) {
      source += `\\${char}`;
      continue;
    }
    source += char;
  }
  source += '$';
  return new RegExp(source);
}

export function relativeFromBase(basePath: string, candidatePath: string) {
  if (basePath === '/') {
    return candidatePath.slice(1);
  }
  const basePrefix = `${basePath.replace(/\/+$/, '')}/`;
  if (!candidatePath.startsWith(basePrefix)) {
    return candidatePath;
  }
  return candidatePath.slice(basePrefix.length);
}

export function inferTypeMatches(filePath: string, requestedType?: string) {
  if (!requestedType) {
    return true;
  }
  const extension = filePath.includes('.') ? filePath.slice(filePath.lastIndexOf('.') + 1).toLowerCase() : '';
  const map: Record<string, string[]> = {
    ts: ['ts', 'tsx'],
    js: ['js', 'jsx', 'mjs', 'cjs'],
    json: ['json', 'json5'],
    md: ['md', 'markdown'],
    yaml: ['yaml', 'yml'],
    text: ['txt'],
    html: ['html', 'htm'],
    css: ['css', 'scss', 'sass'],
  };
  const allowed = map[requestedType] ?? [requestedType];
  return allowed.includes(extension);
}

export function createStructuredPatch(oldContent: string, newContent: string): StructuredPatch[] {
  if (oldContent === newContent) {
    return [];
  }
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');
  let prefix = 0;
  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) {
    prefix += 1;
  }

  let suffix = 0;
  while (
    suffix < oldLines.length - prefix &&
    suffix < newLines.length - prefix &&
    oldLines[oldLines.length - suffix - 1] === newLines[newLines.length - suffix - 1]
  ) {
    suffix += 1;
  }

  const oldMiddle = oldLines.slice(prefix, oldLines.length - suffix);
  const newMiddle = newLines.slice(prefix, newLines.length - suffix);
  const lines = [
    ...oldLines.slice(Math.max(0, prefix - 1), prefix).map(line => ` ${line}`),
    ...oldMiddle.map(line => `-${line}`),
    ...newMiddle.map(line => `+${line}`),
    ...oldLines.slice(oldLines.length - suffix, Math.min(oldLines.length - suffix + 1, oldLines.length)).map(line => ` ${line}`),
  ];

  return [
    {
      oldStart: prefix + 1,
      oldLines: oldMiddle.length,
      newStart: prefix + 1,
      newLines: newMiddle.length,
      lines,
    },
  ];
}

export function toCatNumberedText(content: string, offset: number, limit: number) {
  const lines = content.split('\n');
  const actual = limit === 0 ? lines.slice(offset) : lines.slice(offset, offset + limit);
  return {
    content: actual
      .map((line, index) => `${String(offset + index + 1).padStart(6, ' ')}\t${line}`)
      .join('\n'),
    numLines: actual.length,
    totalLines: lines.length,
  };
}

export function applyWorldbookPatch(entry: WorldbookEntry, patch: Record<string, unknown>): WorldbookEntry {
  return correctlyMerge(_.cloneDeep(entry), patch);
}
