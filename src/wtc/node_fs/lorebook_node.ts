import type { DirectoryNode, Node, NodeStat } from '@/wtc/node_fs/types';
import { openLorebookView } from '@/wtc/node_fs/view';
import { entryForFilePath, findDirectoryFileSpan, listImmediateChildren, normalizeChildPath } from '@/wtc/node_fs/helpers';
import { LorebookEntryNode } from '@/wtc/node_fs/lorebook_entry_node';
import { VirtualDirectoryNode } from '@/wtc/node_fs/virtual_directory_node';

export class LorebookNode implements DirectoryNode {
  public readonly path: string;

  constructor(public readonly lorebookName: string) {
    this.path = `/${lorebookName}`;
  }

  /** 返回当前世界书目录节点的基础信息。 */
  async stat(): Promise<NodeStat & { kind: 'directory' }> {
    return {
      path: this.path,
      name: this.lorebookName,
      kind: 'directory',
      readable: true,
      writable: true,
    };
  }

  /** 打开当前世界书在本次操作中的有序视图。 */
  async openView() {
    // LorebookNode 本身不缓存 list 结果；每次操作打开一份新的 view。
    return openLorebookView(this.lorebookName);
  }

  /** 按局部名字读取当前世界书根目录下的直接子节点。 */
  async getChild(name: string): Promise<Node | null> {
    const view = await this.openView();
    const { fileStart, fileEnd } = findDirectoryFileSpan(view, this.path);
    for (const child of listImmediateChildren(view, this.path, fileStart, fileEnd)) {
      if (child.name !== name) {
        continue;
      }
      if (child.kind === 'directory') {
        return new VirtualDirectoryNode(view, child.path, child.fileStart, child.fileEnd);
      }
      return new LorebookEntryNode(view, child.entry);
    }
    const filePath = normalizeChildPath(this.path, name);
    if (!filePath) {
      return null;
    }
    const entry = entryForFilePath(view, filePath);
    return entry ? new LorebookEntryNode(view, entry) : null;
  }

  /** 列出当前世界书根目录下的直接子节点。 */
  async *list(): AsyncIterable<Node> {
    const view = await this.openView();
    const { fileStart, fileEnd } = findDirectoryFileSpan(view, this.path);
    yield* new VirtualDirectoryNode(view, this.path, fileStart, fileEnd).list();
  }
}
