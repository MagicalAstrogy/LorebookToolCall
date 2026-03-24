import type { DirectoryNode, Node, NodeStat } from '@/wtc/node_fs/types';
import { getSafeWorldbookNames } from '@/wtc/fs_bind';
import { LorebookNode } from '@/wtc/node_fs/lorebook_node';
import { LOREBOOKS_ROOT_NAME, LOREBOOKS_ROOT_PATH } from '@/wtc/store';

export class LorebooksRootNode implements DirectoryNode {
  public readonly path = LOREBOOKS_ROOT_PATH;

  /** 返回 Worldbooks 根目录节点的基础信息。 */
  async stat(): Promise<NodeStat & { kind: 'directory' }> {
    return {
      path: this.path,
      name: LOREBOOKS_ROOT_NAME,
      kind: 'directory',
      readable: true,
      writable: false,
    };
  }

  /** 按世界书名称读取 `/Worldbooks` 下的直接子节点。 */
  async getChild(name: string): Promise<Node | null> {
    if (!getSafeWorldbookNames().includes(name)) {
      return null;
    }
    return new LorebookNode(name);
  }

  /** 列出 `/Worldbooks` 下所有可映射的世界书节点。 */
  async *list(): AsyncIterable<Node> {
    for (const name of getSafeWorldbookNames()) {
      yield new LorebookNode(name);
    }
  }
}
