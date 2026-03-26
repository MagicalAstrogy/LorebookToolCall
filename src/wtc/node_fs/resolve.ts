import type { DirectoryNode, Node, TextFileNode } from '@/wtc/node_fs/types';
import {
  isDirectoryNode,
  isTextFileNode,
  isWritableDirectoryNode,
} from '@/wtc/node_fs/types';
import { hasPresetCurrentConflict, openPresetView, resolveWorldbookBackedFileTarget } from '@/wtc/fs_bind';
import { ConflictTextFileNode } from '@/wtc/node_fs/character_child_nodes';
import { LorebookNode } from '@/wtc/node_fs/lorebook_node';
import { CurrentPresetConflictNode, CurrentPresetLinkNode, PresetNode, PresetVirtualDirectoryNode } from '@/wtc/node_fs/preset_nodes';
import { RootNode } from '@/wtc/node_fs/root_node';
import { VirtualDirectoryNode } from '@/wtc/node_fs/virtual_directory_node';
import { openLorebookView } from '@/wtc/node_fs/view';
import { normalizeVirtualPath } from '@/wtc/store';

function splitPathSegments(path: string) {
  if (path === '/') {
    return [];
  }
  return path.slice(1).split('/').filter(segment => segment !== '');
}

async function createImplicitWritableDirectoryNode(parent: DirectoryNode, name: string): Promise<DirectoryNode | null> {
  const childPath = normalizeVirtualPath(`${parent.path.replace(/\/+$/, '')}/${name}`);
  if (!childPath) {
    return null;
  }
  // 只有会在写入时隐式展开子目录的目录类型才在这里特判。
  if (parent instanceof LorebookNode) {
    const view = await parent.openView();
    return new VirtualDirectoryNode(view, childPath, 0, 0);
  }
  if (parent instanceof VirtualDirectoryNode) {
    return new VirtualDirectoryNode(parent.view, childPath, 0, 0);
  }
  if (parent instanceof PresetNode) {
    const view = parent.openView();
    const actualPath = `${view.rootPath}/${name}`.replace(/\/+/g, '/');
    return new PresetVirtualDirectoryNode(view, childPath, actualPath, 0, 0);
  }
  if (parent instanceof CurrentPresetLinkNode) {
    const targetPath = await parent.readlink();
    const actualPath = `${targetPath.replace(/\/+$/, '')}/${name}`;
    return new PresetVirtualDirectoryNode(openPresetView(parent.targetPresetName), childPath, actualPath, 0, 0);
  }
  if (parent instanceof PresetVirtualDirectoryNode) {
    const actualPath = `${parent.actualPath.replace(/\/+$/, '')}/${name}`;
    return new PresetVirtualDirectoryNode(parent.view, childPath, actualPath, 0, 0);
  }
  return null;
}

/** 从根节点出发，按路径段逐级调用 `getChild()` 解析任意节点。 */
export async function resolveNode(path: string): Promise<Node | null> {
  const normalized = normalizeVirtualPath(path);
  if (!normalized) {
    return null;
  }

  let current: Node = new RootNode();
  for (const segment of splitPathSegments(normalized)) {
    if (!isDirectoryNode(current)) {
      return null;
    }
    const next = await current.getChild(segment);
    if (!next) {
      return null;
    }
    current = next;
  }

  return current;
}

/** 按目录语义解析一个绝对路径。 */
export async function resolveDirectoryNode(path: string): Promise<DirectoryNode | null> {
  const normalized = normalizeVirtualPath(path);
  // Current 与真实 preset 同名时，目录语义也要短路成冲突节点，避免继续解引用。
  if (normalized && normalized.startsWith('/Presets/Current/') && hasPresetCurrentConflict()) {
    return new CurrentPresetConflictNode('/Presets/Current');
  }
  const node = await resolveNode(path);
  return node && isDirectoryNode(node) ? node : null;
}

/** 按文件语义解析一个绝对路径。 */
export async function resolveFileNode(path: string): Promise<TextFileNode | null> {
  const normalized = normalizeVirtualPath(path);
  if (!normalized || normalized === '/') {
    return null;
  }
  // 文件语义下的 Current 冲突不需要再解路径，直接返回冲突占位文件即可。
  if (normalized.startsWith('/Presets/Current/') && hasPresetCurrentConflict()) {
    return new ConflictTextFileNode(normalized);
  }

  const worldbookTarget = await resolveWorldbookBackedFileTarget(normalized);
  if (worldbookTarget) {
    const view = await openLorebookView(worldbookTarget.worldbookName);
    if (view.conflicts.has(worldbookTarget.targetPath)) {
      return new ConflictTextFileNode(worldbookTarget.logicalPath);
    }
  }

  const node = await resolveNode(path);
  return node && isTextFileNode(node) ? node : null;
}

/** 按搜索语义解析一个绝对路径。 */
export async function resolveSearchScope(path: string): Promise<{
  fileNode: TextFileNode | null;
  directoryNode: DirectoryNode | null;
}> {
  const [fileNode, directoryNode] = await Promise.all([
    resolveFileNode(path),
    resolveDirectoryNode(path),
  ]);
  return {
    fileNode,
    directoryNode,
  };
}

/** 按写入语义解析一个绝对路径；允许在父目录支持时返回 create-on-write 占位文件节点。 */
export async function resolveWritableFileNode(path: string): Promise<TextFileNode | null> {
  const normalized = normalizeVirtualPath(path);
  if (!normalized || normalized === '/') {
    return null;
  }
  // create-on-write 也必须遵守 Current 冲突规则，避免把冲突路径误当作可创建文件。
  if (normalized.startsWith('/Presets/Current/') && hasPresetCurrentConflict()) {
    return new ConflictTextFileNode(normalized);
  }

  const existing = await resolveFileNode(normalized);
  if (existing) {
    return existing;
  }

  const segments = splitPathSegments(normalized);
  if (segments.length === 0) {
    return null;
  }
  const fileName = segments[segments.length - 1];
  let current: Node = new RootNode();
  for (const segment of segments.slice(0, -1)) {
    if (!isDirectoryNode(current)) {
      return null;
    }
    let next = await current.getChild(segment);
    if (!next) {
      next = await createImplicitWritableDirectoryNode(current, segment);
    }
    if (!next || !isDirectoryNode(next)) {
      return null;
    }
    current = next;
  }
  if (!isWritableDirectoryNode(current)) {
    return null;
  }
  return current.getWritableChild(fileName);
}
