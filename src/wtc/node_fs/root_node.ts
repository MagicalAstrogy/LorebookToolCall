import type { DirectoryNode, Node, NodeStat } from '@/wtc/node_fs/types';
import { CharactersRootNode } from '@/wtc/node_fs/characters_root_node';
import { LorebooksRootNode } from '@/wtc/node_fs/lorebooks_root_node';
import { PresetsRootNode } from '@/wtc/node_fs/preset_nodes';
import { SchemasRootNode } from '@/wtc/node_fs/schema_nodes';

export class RootNode implements DirectoryNode {
  public readonly path = '/';
  // 根目录的直接孩子是固定集合，构造时缓存即可，避免每次 list/getChild 都重复 new。
  private readonly childrenByName: Record<string, Node> = {};
  private readonly children: Node[] = [];

  constructor() {
    this.insert('Characters', new CharactersRootNode());
    this.insert('Worldbooks', new LorebooksRootNode());
    this.insert('Presets', new PresetsRootNode());
    this.insert('Schemas', new SchemasRootNode());
  }

  private insert(name: string, node: Node) {
    this.childrenByName[name] = node;
    this.children.push(node);
  }

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
    return this.childrenByName[name] ?? null;
  }

  /** 列出根目录下的固定子目录。 */
  async *list(): AsyncIterable<Node> {
    for (const child of this.children) {
      yield child;
    }
  }
}
