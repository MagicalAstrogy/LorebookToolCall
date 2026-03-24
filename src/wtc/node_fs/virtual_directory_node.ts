import type { LorebookView, Node, NodeStat, TextFileNode, WritableDirectoryNode } from '@/wtc/node_fs/types';
import { directoryExistsInView } from '@/wtc/node_fs/view';
import { basenameFromPath, entryForFilePath, findDirectoryFileSpan, listImmediateChildren, normalizeChildPath } from '@/wtc/node_fs/helpers';
import { CreatableLorebookEntryNode, LorebookEntryNode } from '@/wtc/node_fs/lorebook_entry_node';
import { ConflictTextFileNode } from '@/wtc/node_fs/character_child_nodes';

export class VirtualDirectoryNode implements WritableDirectoryNode {
  // VirtualDirectoryNode 只是“view + 目录前缀”的短生命周期视图节点。
  // 其中 `fileStart/fileEnd` 表示当前目录在 view.files 中负责的连续半开区间。
  constructor(
    public readonly view: LorebookView,
    public readonly path: string,
    public readonly fileStart: number,
    public readonly fileEnd: number,
  ) {}

  /** 返回当前虚拟目录节点的基础信息。 */
  async stat(): Promise<NodeStat & { kind: 'directory' }> {
    return {
      path: this.path,
      name: basenameFromPath(this.path),
      kind: 'directory',
      readable: true,
      writable: true,
    };
  }

  /** 按局部名字读取当前虚拟目录下的直接子节点。 */
  async getChild(name: string): Promise<Node | null> {
    for (const child of listImmediateChildren(this.view, this.path, this.fileStart, this.fileEnd)) {
      if (child.name !== name) {
        continue;
      }
      if (child.kind === 'directory') {
        return new VirtualDirectoryNode(this.view, child.path, child.fileStart, child.fileEnd);
      }
      return new LorebookEntryNode(this.view, child.entry);
    }
    const childPath = `${this.path.replace(/\/+$/, '')}/${name}`;
    // 这里只有在“当前 span 为空或失配”时才会命中。
    // 典型场景是调用方用 lazy/占位方式手工构造了 VirtualDirectoryNode，
    // 传入的 [fileStart, fileEnd) 还没覆盖到这个真实子目录。
    // 这时允许退回到全局目录索引重新计算一次子目录 span，保证 getChild 仍能恢复工作。
    if (directoryExistsInView(this.view, childPath)) {
      const { fileStart, fileEnd } = findDirectoryFileSpan(this.view, childPath);
      return new VirtualDirectoryNode(this.view, childPath, fileStart, fileEnd);
    }
    const filePath = normalizeChildPath(this.path, name);
    if (!filePath) {
      return null;
    }
    const entry = entryForFilePath(this.view, filePath);
    return entry ? new LorebookEntryNode(this.view, entry) : null;
  }

  /** 列出当前虚拟目录下的直接子节点。 */
  async *list(): AsyncIterable<Node> {
    // list 只扫描当前目录负责的区间；不再全量遍历整本世界书。
    const nodes: Node[] = [];
    for (const child of listImmediateChildren(this.view, this.path, this.fileStart, this.fileEnd)) {
      if (child.kind === 'directory') {
        nodes.push(new VirtualDirectoryNode(this.view, child.path, child.fileStart, child.fileEnd));
      } else {
        nodes.push(new LorebookEntryNode(this.view, child.entry));
      }
    }

    nodes.sort((left, right) => {
      const leftPath = 'list' in left ? `${left.path}/` : left.path;
      const rightPath = 'list' in right ? `${right.path}/` : right.path;
      return leftPath < rightPath ? -1 : leftPath > rightPath ? 1 : 0;
    });

    for (const node of nodes) {
      yield node;
    }
  }

  /** 读取当前虚拟目录下可写入的直接子文件；缺失时返回 create-on-write 占位节点。 */
  async getWritableChild(name: string): Promise<TextFileNode | null> {
    const existing = await this.getChild(name);
    if (existing && 'read' in existing) {
      return existing as TextFileNode;
    }
    if (existing) {
      return new ConflictTextFileNode(normalizeChildPath(this.path, name) ?? `${this.path}/${name}`);
    }
    const filePath = normalizeChildPath(this.path, name);
    return filePath ? new CreatableLorebookEntryNode(this.view.worldbookName, filePath, filePath.slice(this.view.rootPath.length + 1)) : null;
  }
}
