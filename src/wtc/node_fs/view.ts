import { buildPathIndex, loadRawWorldbook, toLorebookRootPath } from '@/wtc/store';
import { comparePath } from '@/wtc/node_fs/helpers';
import type { IndexedEntry } from '@/wtc/store';
import type { LorebookView } from '@/wtc/node_fs/types';

function splitVisibleFilesAndShadowedConflicts(rootPath: string, files: IndexedEntry[], directories: string[]) {
  // 目录占据路径名；如果某个精确文件路径同时也是目录路径前缀，
  // 则该文件在 Node FS 中不会作为可见文件暴露，但仍然要计入冲突集合，
  // 这样文件语义访问会明确得到冲突错误，而不是静默落到目录或创建逻辑上。
  const occupiedPaths = new Set(
    directories
      .map(directory => directory.replace(/\/+$/, ''))
      .filter(directory => directory !== '' && directory !== rootPath),
  );

  const visibleFiles: IndexedEntry[] = [];
  const shadowedConflicts = new Set<string>();
  for (const file of files) {
    if (occupiedPaths.has(file.filePath)) {
      shadowedConflicts.add(file.filePath);
      continue;
    }
    visibleFiles.push(file);
  }

  return {
    visibleFiles,
    shadowedConflicts,
  };
}

function rebuildExactFileIndex(files: IndexedEntry[], shadowedConflicts: Set<string>) {
  const exactFiles = new Map<string, IndexedEntry>();
  const conflicts = new Set<string>(shadowedConflicts);

  for (const file of files) {
    if (exactFiles.has(file.filePath)) {
      conflicts.add(file.filePath);
      continue;
    }
    exactFiles.set(file.filePath, file);
  }

  return {
    exactFiles,
    conflicts,
  };
}

/**
 * 打开某本世界书在单次操作范围内的有序视图。
 * 这份视图不跨操作复用，用于支撑当前这一次解析、遍历或搜索。
 */
export async function openLorebookView(lorebookName: string): Promise<LorebookView> {
  // 每次打开 view 都重新从宿主读取，保证 list/getChild 不依赖跨操作缓存。
  const book = await loadRawWorldbook(lorebookName);
  const rootPath = toLorebookRootPath(lorebookName);
  const index = buildPathIndex(lorebookName, book, rootPath);
  const { visibleFiles, shadowedConflicts } = splitVisibleFilesAndShadowedConflicts(rootPath, index.files, index.directories);
  const { exactFiles, conflicts } = rebuildExactFileIndex(visibleFiles, shadowedConflicts);
  return {
    worldbookName: lorebookName,
    rootPath,
    // 这里必须使用与前缀判断一致的稳定字典序；后续目录 span 优化依赖这个前提。
    files: [...visibleFiles].sort((left, right) => comparePath(left.filePath, right.filePath)),
    directories: [...index.directories].sort(),
    exactFiles,
    conflicts,
  };
}

/** 判断指定路径在当前 view 中是否可作为目录访问。 */
export function directoryExistsInView(view: LorebookView, path: string) {
  // Lorebook 根目录本身不在 directories 中单独重复存一份，这里特判。
  return path === view.rootPath || view.directories.includes(`${path.replace(/\/+$/, '')}/`);
}

/** 判断指定路径在当前 view 中是否存在精确文件条目。 */
export function fileExistsInView(view: LorebookView, path: string) {
  return view.exactFiles.has(path);
}
