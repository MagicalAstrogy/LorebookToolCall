import type { DirectoryNode, Node, NodeStat } from '@/wtc/node_fs/types';
import { getSafeCharacterNames } from '@/wtc/fs_bind';
import { CharacterNode } from '@/wtc/node_fs/character_node';
import { CHARACTERS_ROOT_NAME, CHARACTERS_ROOT_PATH } from '@/wtc/store';

export class CharactersRootNode implements DirectoryNode {
  public readonly path = CHARACTERS_ROOT_PATH;

  /** 返回角色目录根节点的基础信息。 */
  async stat(): Promise<NodeStat & { kind: 'directory' }> {
    return {
      path: this.path,
      name: CHARACTERS_ROOT_NAME,
      kind: 'directory',
      readable: true,
      writable: false,
    };
  }

  /** 按角色名称读取 `/Characters` 下的直接子节点。 */
  async getChild(name: string): Promise<Node | null> {
    if (!getSafeCharacterNames().includes(name)) {
      return null;
    }
    return new CharacterNode(name);
  }

  /** 列出 `/Characters` 下所有可映射的角色节点。 */
  async *list(): AsyncIterable<Node> {
    for (const name of getSafeCharacterNames()) {
      yield new CharacterNode(name);
    }
  }
}
