import type { DirectoryNode } from '@/wtc/node_fs/types';
import { normalizeVirtualPath } from '@/wtc/store';
import { directoryExistsInView, openLorebookView } from '@/wtc/node_fs/view';
import { entryForFilePath, findDirectoryFileSpan } from '@/wtc/node_fs/helpers';
import { RootNode } from '@/wtc/node_fs/root_node';
import { LorebookNode } from '@/wtc/node_fs/lorebook_node';
import { LorebookEntryNode } from '@/wtc/node_fs/lorebook_entry_node';
import { VirtualDirectoryNode } from '@/wtc/node_fs/virtual_directory_node';

/** 按目录语义解析一个绝对路径。 */
export async function resolveDirectoryNode(path: string): Promise<DirectoryNode | null> {
  // 目录解析与文件解析分离，避免同名文件/目录并存时语义混淆。
  const normalized = normalizeVirtualPath(path);
  if (!normalized) {
    return null;
  }
  if (normalized === '/') {
    return new RootNode();
  }

  const segments = normalized.slice(1).split('/');
  const lorebookName = segments[0];
  const lorebook = new LorebookNode(lorebookName);
  if (segments.length === 1) {
    await lorebook.openView();
    return lorebook;
  }

  const view = await lorebook.openView();
  if (!directoryExistsInView(view, normalized)) {
    return null;
  }
  const { fileStart, fileEnd } = findDirectoryFileSpan(view, normalized);
  return new VirtualDirectoryNode(view, normalized, fileStart, fileEnd);
}

/** 按文件语义解析一个绝对路径。 */
export async function resolveFileNode(path: string): Promise<LorebookEntryNode | null> {
  // 文件解析只接受精确文件路径，不把目录视为同一路径上的可替代结果。
  const normalized = normalizeVirtualPath(path);
  if (!normalized || normalized === '/') {
    return null;
  }
  const segments = normalized.slice(1).split('/');
  if (segments.length < 2) {
    return null;
  }
  const lorebookName = segments[0];
  const view = await openLorebookView(lorebookName);
  const entry = entryForFilePath(view, normalized);
  return entry ? new LorebookEntryNode(view, entry) : null;
}

/** 按搜索语义解析一个绝对路径，允许同时命中文件节点和目录节点。 */
export async function resolveSearchScope(path: string): Promise<{
  fileNode: LorebookEntryNode | null;
  directoryNode: DirectoryNode | null;
}> {
  // 搜索场景允许同一路径同时命中文件节点与目录节点，供 grep 统一处理。
  const normalized = normalizeVirtualPath(path);
  if (!normalized || normalized === '/') {
    return {
      fileNode: null,
      directoryNode: null,
    };
  }
  const segments = normalized.slice(1).split('/');
  const lorebookName = segments[0];
  const view = await openLorebookView(lorebookName);
  const fileEntry = segments.length > 1 ? entryForFilePath(view, normalized) : null;
  const fileNode = fileEntry ? new LorebookEntryNode(view, fileEntry) : null;
  const directoryNode =
    segments.length === 1
      ? new LorebookNode(lorebookName)
      : directoryExistsInView(view, normalized)
        ? (() => {
            const { fileStart, fileEnd } = findDirectoryFileSpan(view, normalized);
            return new VirtualDirectoryNode(view, normalized, fileStart, fileEnd);
          })()
        : null;
  return {
    fileNode,
    directoryNode,
  };
}
