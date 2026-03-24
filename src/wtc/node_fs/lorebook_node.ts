import type { Node, NodeStat, TextFileNode, WritableDirectoryNode } from '@/wtc/node_fs/types';
import { openLorebookView } from '@/wtc/node_fs/view';
import { entryForFilePath, findDirectoryFileSpan, listImmediateChildren, normalizeChildPath } from '@/wtc/node_fs/helpers';
import { CreatableLorebookEntryNode, LorebookEntryNode } from '@/wtc/node_fs/lorebook_entry_node';
import { VirtualDirectoryNode } from '@/wtc/node_fs/virtual_directory_node';
import { ConflictTextFileNode } from '@/wtc/node_fs/character_child_nodes';
import { toLorebookRootPath } from '@/wtc/store';

export class LorebookNode implements WritableDirectoryNode {
  public readonly path: string;

  constructor(public readonly lorebookName: string) {
    this.path = toLorebookRootPath(lorebookName);
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

  /** 读取当前世界书根目录下可写入的直接子文件；缺失时返回 create-on-write 占位节点。 */
  async getWritableChild(name: string): Promise<TextFileNode | null> {
    const existing = await this.getChild(name);
    if (existing && 'read' in existing) {
      return existing as TextFileNode;
    }
    if (existing) {
      return new ConflictTextFileNode(normalizeChildPath(this.path, name) ?? `${this.path}/${name}`);
    }
    const filePath = normalizeChildPath(this.path, name);
    return filePath ? new CreatableLorebookEntryNode(this.lorebookName, filePath, name) : null;
  }

  /** 列出当前世界书根目录下的直接子节点。 */
  async *list(): AsyncIterable<Node> {
    const view = await this.openView();
    const { fileStart, fileEnd } = findDirectoryFileSpan(view, this.path);
    yield* new VirtualDirectoryNode(view, this.path, fileStart, fileEnd).list();
  }
}
