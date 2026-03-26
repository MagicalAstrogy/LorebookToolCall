import type { IndexedEntry, PathMappedEntry } from '@/wtc/store';
import { ensureNoConflict, normalizeVirtualPath } from '@/wtc/store';
import type { PathMappedView } from '@/wtc/node_fs/types';

// 目录展开现在同时服务于 Lorebook 和 Preset 两类“路径映射视图”。
export type DirectoryChildDescriptor<TEntry extends PathMappedEntry = IndexedEntry> =
  | {
      kind: 'file';
      name: string;
      entry: TEntry;
    }
  | {
      kind: 'directory';
      name: string;
      path: string;
      // [fileStart, fileEnd) 表示这个目录在 view.files 中负责的连续区间。
      // 这里依赖 view.files 已按 filePath 做稳定字典序排序。
      fileStart: number;
      fileEnd: number;
    };

/** 从绝对路径中提取最后一段名字。 */
export function basenameFromPath(path: string) {
  if (path === '/') {
    return '/';
  }
  const normalized = path.replace(/\/+$/, '');
  const segments = normalized.split('/');
  return segments[segments.length - 1] || '/';
}

/** 将父路径与局部名字拼成归一化后的子路径。 */
export function normalizeChildPath(parentPath: string, name: string) {
  return normalizeVirtualPath(`${parentPath.replace(/\/+$/, '')}/${name}`);
}

/** 以稳定字典序比较路径；排序必须与 startsWith 前缀判断保持一致。 */
export function comparePath(left: string, right: string) {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function lowerBoundByPath(files: readonly PathMappedEntry[], target: string) {
  let low = 0;
  let high = files.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (comparePath(files[middle].filePath, target) < 0) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}

/**
 * 计算目录在 view.files 中对应的连续区间。
 *
 * 前提：
 * - `view.files` 必须已按 `filePath` 做稳定字典序排序
 * - 同一目录前缀下的所有文件会连续落在同一个区间里
 *
 * 返回值采用半开区间 `[fileStart, fileEnd)`：
 * - `fileStart` 是目录下第一条文件的索引
 * - `fileEnd` 是目录下最后一条文件的后一位索引
 */
export function findDirectoryFileSpan<TEntry extends PathMappedEntry>(view: PathMappedView<TEntry>, directoryPath: string) {
  const normalizedDirectory = directoryPath === view.rootPath ? directoryPath : directoryPath.replace(/\/+$/, '');
  if (normalizedDirectory === view.rootPath) {
    return {
      fileStart: 0,
      fileEnd: view.files.length,
    };
  }
  const prefix = `${normalizedDirectory}/`;
  const fileStart = lowerBoundByPath(view.files, prefix);
  const fileEnd = lowerBoundByPath(view.files, `${prefix}\uffff`);
  return {
    fileStart,
    fileEnd,
  };
}

/**
 * 从一个目录负责的文件区间中推导其直接孩子。
 *
 * 参数语义：
 * - `directoryPath` 是当前目录的绝对路径
 * - `fileStart/fileEnd` 是当前目录在 `view.files` 中对应的连续半开区间
 *
 * 结果会直接携带子目录自己的区间，便于后续创建 `VirtualDirectoryNode`
 * 时继续只扫描子区间，而不是重新全量扫描整本世界书。
 */
export function listImmediateChildren<TEntry extends PathMappedEntry>(
  view: PathMappedView<TEntry>,
  directoryPath: string,
  fileStart: number,
  fileEnd: number,
): DirectoryChildDescriptor<TEntry>[] {
  const normalizedDirectory = directoryPath === view.rootPath ? directoryPath : directoryPath.replace(/\/+$/, '');
  const basePrefix = `${normalizedDirectory}/`;
  const children: DirectoryChildDescriptor<TEntry>[] = [];

  let index = fileStart;
  while (index < fileEnd) {
    const file = view.files[index];
    const relative = file.filePath.slice(basePrefix.length);
    if (relative === '') {
      index += 1;
      continue;
    }
    const [head, ...rest] = relative.split('/');
    if (rest.length === 0) {
      children.push({
        kind: 'file',
        name: head,
        entry: file,
      });
      index += 1;
      continue;
    }

    const childPath = `${normalizedDirectory}/${head}`;
    const childPrefix = `${childPath}/`;
    const childStart = index;
    index += 1;
    while (index < fileEnd && view.files[index].filePath.startsWith(childPrefix)) {
      index += 1;
    }
    children.push({
      kind: 'directory',
      name: head,
      path: childPath,
      fileStart: childStart,
      fileEnd: index,
    });
  }

  return children;
}

/** 按精确文件路径从 view 中取出对应条目，并在命中冲突时直接失败。 */
export function entryForFilePath<TEntry extends PathMappedEntry>(view: PathMappedView<TEntry>, filePath: string) {
  // 文件精确访问前先检查冲突；同名冲突时应直接失败，而不是任意挑一个。
  ensureNoConflict(view, filePath);
  return view.exactFiles.get(filePath) ?? null;
}
