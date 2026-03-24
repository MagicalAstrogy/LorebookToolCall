import { buildPathIndex, loadRawWorldbook } from '@/wtc/store';
import { comparePath } from '@/wtc/node_fs/helpers';
import type { LorebookView } from '@/wtc/node_fs/types';

/**
 * 打开某本世界书在单次操作范围内的有序视图。
 * 这份视图不跨操作复用，用于支撑当前这一次解析、遍历或搜索。
 */
export async function openLorebookView(lorebookName: string): Promise<LorebookView> {
  // 每次打开 view 都重新从宿主读取，保证 list/getChild 不依赖跨操作缓存。
  const book = await loadRawWorldbook(lorebookName);
  const index = buildPathIndex(lorebookName, book);
  return {
    lorebookName,
    // 这里必须使用与前缀判断一致的稳定字典序；后续目录 span 优化依赖这个前提。
    files: [...index.files].sort((left, right) => comparePath(left.filePath, right.filePath)),
    directories: [...index.directories].sort(),
    exactFiles: index.exactFiles,
    conflicts: index.conflicts,
  };
}

/** 判断指定路径在当前 view 中是否可作为目录访问。 */
export function directoryExistsInView(view: LorebookView, path: string) {
  // Lorebook 根目录本身不在 directories 中单独重复存一份，这里特判。
  return path === `/${view.lorebookName}` || view.directories.includes(`${path.replace(/\/+$/, '')}/`);
}

/** 判断指定路径在当前 view 中是否存在精确文件条目。 */
export function fileExistsInView(view: LorebookView, path: string) {
  return view.exactFiles.has(path);
}
