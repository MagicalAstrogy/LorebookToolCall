import type { DirectoryNode, Node, NodeStat } from '@/wtc/node_fs/types';
import { CharactersRootNode } from '@/wtc/node_fs/characters_root_node';
import { LorebooksRootNode } from '@/wtc/node_fs/lorebooks_root_node';
import { SchemasRootNode } from '@/wtc/node_fs/schema_nodes';

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

  /** 按固定目录名读取根目录下的直接子节点。 */
  async getChild(name: string): Promise<Node | null> {
    switch (name) {
      case 'Worldbooks':
        return new LorebooksRootNode();
      case 'Characters':
        return new CharactersRootNode();
      case 'Schemas':
        return new SchemasRootNode();
      default:
        return null;
    }
  }

  /** 列出根目录下的固定子目录。 */
  async *list(): AsyncIterable<Node> {
    yield new CharactersRootNode();
    yield new LorebooksRootNode();
    yield new SchemasRootNode();
  }
}
