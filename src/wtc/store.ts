import { correctlyMerge } from '@util/common';
import _ from 'lodash';
import { ToolError, invalidPathDetail } from '@/wtc/result';

// 兼容工具调用常见 diff 结构，只描述首个连续变更块即可满足当前需求。
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

// 同一本世界书上的写操作串行化，避免并发覆盖。
const queueMap = new Map<string, Promise<void>>();

export function normalizeVirtualPath(input: string): string | null {
  // 虚拟路径按 POSIX 规则归一化，但不允许相对路径。
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
  // 第一段固定解释为世界书名，其余部分视为条目 comment 对应的虚拟路径。
  const [worldbookName, ...rest] = normalized.slice(1).split('/');
  return {
    normalized,
    worldbookName,
    entryPath: rest.length > 0 ? rest.join('/') : null,
  };
}

export function requireFileTarget(input: string) {
  const parsed = parseVirtualPath(input);
  // 仅文件类工具可调用这里；根目录或世界书根路径都不算具体条目。
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
  // 保存后同步刷新编辑器和世界书列表，避免 UI 仍停留在旧状态。
  await SillyTavern.saveWorldInfo(worldbookName, book, true);
  SillyTavern.reloadWorldInfoEditor(worldbookName, false);
  await SillyTavern.updateWorldInfoList();
}

export function getRawBookEntries(book: RawBook): SillyTavern.v2DataWorldInfoEntry[] {
  return _.toArray(book.entries);
}

export function findRawBookEntry(book: RawBook, predicate: (entry: SillyTavern.v2DataWorldInfoEntry) => boolean) {
  return getRawBookEntries(book).find(predicate);
}

export async function withWorldbookQueue<T>(worldbookName: string, action: () => Promise<T>): Promise<T> {
  const previous = queueMap.get(worldbookName) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>(resolve => {
    release = resolve;
  });
  const chained = previous.then(() => current);
  queueMap.set(worldbookName, chained);

  // 显式等待上一次同书写操作结束，再进入当前临界区。
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
  // 世界书里的 comment 被视为虚拟文件路径；同时派生目录集合和冲突集合。
  const exactFiles = new Map<string, IndexedEntry>();
  const conflicts = new Set<string>();
  const files: IndexedEntry[] = [];
  const directories = new Set<string>([`/${worldbookName}/`]);

  for (const raw of getRawBookEntries(book)) {
    const normalized = normalizeVirtualPath(`/${worldbookName}/${raw.comment ?? ''}`);
    if (!normalized || normalized === `/${worldbookName}`) {
      continue;
    }
    const entryPath = normalized.slice(worldbookName.length + 2);
    const indexed: IndexedEntry = {
      filePath: normalized,
      entryPath,
      //@ts-expect-error 这里类型定义是错误的
      uid: raw.uid,
      raw,
    };
    files.push(indexed);
    // 归一化后命中同一路径即判定冲突，精确文件操作需要直接失败。
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
    // 根目录只暴露可被工具层识别的世界书，不处理名称里自带 / 的异常情况。
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
  // 只实现当前工具需要的 *, **, ? 语义，行为接近文件系统 glob。
  let source = '^';
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    const next = pattern[index + 1];
    const afterNext = pattern[index + 2];
    if (char === '*' && next === '*' && afterNext === '/') {
      source += '(?:.*/)?';
      index += 2;
      continue;
    }
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
  // Glob/Grep 匹配阶段统一基于相对路径做 pattern 判断。
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
  // 与 ripgrep 的 type 概念保持近似即可，不追求完整语言映射表。
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
  // 通过公共前后缀裁剪，把一次文本替换压缩成单个 diff hunk。
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
    ...oldLines
      .slice(oldLines.length - suffix, Math.min(oldLines.length - suffix + 1, oldLines.length))
      .map(line => ` ${line}`),
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
  // Read 返回类似 cat -n 的格式，方便模型后续继续定位行号。
  const lines = content.split('\n');
  const actual = limit === 0 ? lines.slice(offset) : lines.slice(offset, offset + limit);
  return {
    content: actual.map((line, index) => `${String(offset + index + 1).padStart(6, ' ')}\t${line}`).join('\n'),
    numLines: actual.length,
    totalLines: lines.length,
  };
}

export function applyWorldbookPatch(entry: WorldbookEntry, patch: Record<string, unknown>): WorldbookEntry {
  // 保持 doc 中约定的 lossy patch 语义：对象合并，数组替换，标量覆盖。
  return correctlyMerge(_.cloneDeep(entry), patch);
}
