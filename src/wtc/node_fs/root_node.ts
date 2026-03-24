import type { DirectoryNode, Node, NodeStat } from '@/wtc/node_fs/types';
import { LorebookNode } from '@/wtc/node_fs/lorebook_node';

export class RootNode implements DirectoryNode {
  public readonly path = '/';

  /** 返回根目录节点的基础信息。 */
  async stat(): Promise<NodeStat & { kind: 'directory' }> {
    return {
      path: this.path,
      name: '/',
      kind: 'directory',
      readable: true,
      writable: false,
    };
  }

  /** 按世界书名称读取根目录下的直接子节点。 */
  async getChild(name: string): Promise<Node | null> {
    if (!name || name.includes('/')) {
      return null;
    }
    if (!getWorldbookNames().includes(name) || name.includes('/')) {
      return null;
    }
    return new LorebookNode(name);
  }

  /** 列出根目录下所有可暴露给工具层的世界书节点。 */
  async *list(): AsyncIterable<Node> {
    // 根目录只暴露可映射成单一路径段的世界书名称。
    for (const name of getWorldbookNames().filter(candidate => !candidate.includes('/')).sort()) {
      yield new LorebookNode(name);
    }
  }
}
