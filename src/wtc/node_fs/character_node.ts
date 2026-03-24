import { openCharacterView, resolveCharacterWorldbookTargetPath } from '@/wtc/fs_bind';
import type { DirectoryNode, Node, NodeStat } from '@/wtc/node_fs/types';
import { toCharacterDescriptionPath } from '@/wtc/fs_bind';
import { toCharacterRootPath } from '@/wtc/store';
import {
  CharacterDescriptionNode,
  CharacterFirstMessagesDirectoryNode,
  CharacterRegexDirectoryNode,
  CharacterScriptsDirectoryNode,
} from '@/wtc/node_fs/character_child_nodes';
import { CharacterWorldbookLinkNode } from '@/wtc/node_fs/character_worldbook_link_node';

export class CharacterNode implements DirectoryNode {
  public readonly path: string;

  constructor(public readonly characterName: string) {
    this.path = toCharacterRootPath(characterName);
  }

  /** 返回角色目录节点的基础信息。 */
  async stat(): Promise<NodeStat & { kind: 'directory' }> {
    return {
      path: this.path,
      name: this.characterName,
      kind: 'directory',
      readable: true,
      writable: true,
    };
  }

  /** 打开当前角色在本次操作中的视图。 */
  async openView() {
    return openCharacterView(this.characterName);
  }

  /** 按局部名字读取当前角色目录下的直接子节点。 */
  async getChild(name: string): Promise<Node | null> {
    switch (name) {
      case 'Description.md':
        return new CharacterDescriptionNode(this.characterName, toCharacterDescriptionPath(this.characterName));
      case 'FirstMessages':
        return new CharacterFirstMessagesDirectoryNode(this.characterName, `${this.path}/FirstMessages`);
      case 'Regex':
        return new CharacterRegexDirectoryNode(this.characterName, `${this.path}/Regex`);
      case 'Scripts':
        return new CharacterScriptsDirectoryNode(this.characterName, `${this.path}/Scripts`);
      case 'WorldBook': {
        const view = await this.openView();
        const targetPath = resolveCharacterWorldbookTargetPath(view);
        return targetPath ? new CharacterWorldbookLinkNode(`${this.path}/WorldBook`, targetPath) : null;
      }
      default:
        return null;
    }
  }

  /** 列出角色目录下的固定子结构。 */
  async *list(): AsyncIterable<Node> {
    yield new CharacterDescriptionNode(this.characterName, toCharacterDescriptionPath(this.characterName));
    yield new CharacterFirstMessagesDirectoryNode(this.characterName, `${this.path}/FirstMessages`);
    yield new CharacterRegexDirectoryNode(this.characterName, `${this.path}/Regex`);
    yield new CharacterScriptsDirectoryNode(this.characterName, `${this.path}/Scripts`);

    const view = await this.openView();
    const targetPath = resolveCharacterWorldbookTargetPath(view);
    if (targetPath) {
      yield new CharacterWorldbookLinkNode(`${this.path}/WorldBook`, targetPath);
    }
  }
}
