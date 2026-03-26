import type {
  AttributeNode,
  DeleteBackup,
  DeletableNode,
  DirectoryNode,
  Node,
  NodeStat,
  SymlinkNode,
  TextFileNode,
  TextFilePatch,
} from '@/wtc/node_fs/types';
import {
  isAttributeNode,
  isDeleteBackupCapableNode,
  isDeletableNode,
  isDirectoryNode,
  isTextFileNode,
  isWritableDirectoryNode,
} from '@/wtc/node_fs/types';
import { basenameFromPath } from '@/wtc/node_fs/helpers';
import { LorebookNode } from '@/wtc/node_fs/lorebook_node';
import { parseVirtualPath } from '@/wtc/store';

function rewriteAliasedPath(targetPath: string, sourceBasePath: string, targetBasePath: string) {
  return `${targetBasePath}${targetPath.slice(sourceBasePath.length)}`;
}

class AliasedWorldbookFileNode implements TextFileNode, Partial<AttributeNode>, Partial<DeletableNode> {
  public readonly exists: boolean;
  constructor(
    private readonly target: TextFileNode,
    public readonly path: string,
  ) {
    this.exists = target.exists;
  }

  async stat(): Promise<NodeStat & { kind: 'file' }> {
    const stat = await this.target.stat();
    return {
      ...stat,
      path: this.path,
      name: basenameFromPath(this.path),
      kind: 'file',
    };
  }

  async read(opts?: { offset?: number; limit?: number }): Promise<string> {
    return this.target.read(opts);
  }

  async write(content: string): Promise<void> {
    await this.target.write(content);
  }

  async edit(patch: TextFilePatch) {
    return this.target.edit(patch);
  }

  async getattr?(): Promise<Record<string, unknown>> {
    if (!isAttributeNode(this.target)) {
      throw new Error('unreachable');
    }
    return this.target.getattr();
  }

  async setattr?(patch: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (!isAttributeNode(this.target)) {
      throw new Error('unreachable');
    }
    return this.target.setattr(patch);
  }

  async delete?(): Promise<void> {
    if (!isDeletableNode(this.target)) {
      throw new Error('unreachable');
    }
    return this.target.delete();
  }

  async createDeleteBackup?(): Promise<DeleteBackup> {
    if (!isDeleteBackupCapableNode(this.target)) {
      throw new Error('unreachable');
    }
    const backup = await this.target.createDeleteBackup();
    return {
      ...backup,
      filePath: this.path,
    };
  }

  get uid() {
    return (this.target as TextFileNode & { uid?: number }).uid;
  }
}

class AliasedWorldbookDirectoryNode implements DirectoryNode {
  constructor(
    private readonly target: DirectoryNode,
    public readonly path: string,
    private readonly targetPath: string,
  ) {}

  async stat(): Promise<NodeStat & { kind: 'directory' }> {
    const stat = await this.target.stat();
    return {
      ...stat,
      path: this.path,
      name: basenameFromPath(this.path),
      kind: 'directory',
    };
  }

  async getChild(name: string): Promise<Node | null> {
    const child = await this.target.getChild(name);
    return child ? wrapWorldbookAliasNode(child, this.targetPath, this.path) : null;
  }

  async *list(): AsyncIterable<Node> {
    for await (const child of this.target.list()) {
      yield wrapWorldbookAliasNode(child, this.targetPath, this.path);
    }
  }

  async getWritableChild?(name: string): Promise<TextFileNode | null> {
    if (!isWritableDirectoryNode(this.target)) {
      return null;
    }
    const child = await this.target.getWritableChild(name);
    return child ? (wrapWorldbookAliasNode(child, child.path, `${this.path}/${name}`) as TextFileNode) : null;
  }
}

export function wrapWorldbookAliasNode(node: Node, sourceBasePath: string, targetBasePath: string): Node {
  const logicalPath = rewriteAliasedPath(node.path, sourceBasePath, targetBasePath);
  if (isDirectoryNode(node)) {
    return new AliasedWorldbookDirectoryNode(node, logicalPath, node.path);
  }
  if (isTextFileNode(node)) {
    const fileNode = new AliasedWorldbookFileNode(node, logicalPath);
    if (isAttributeNode(node)) {
      fileNode.getattr = fileNode.getattr?.bind(fileNode);
      fileNode.setattr = fileNode.setattr?.bind(fileNode);
    }
    if (isDeletableNode(node)) {
      fileNode.delete = fileNode.delete?.bind(fileNode);
      if (isDeleteBackupCapableNode(node)) {
        fileNode.createDeleteBackup = fileNode.createDeleteBackup?.bind(fileNode);
      }
    }
    return fileNode;
  }
  return node;
}

export class CharacterWorldbookLinkNode implements SymlinkNode {
  constructor(
    public readonly path: string,
    public readonly targetPath: string,
  ) {}

  async stat(): Promise<NodeStat & { kind: 'symlink' }> {
    return {
      path: this.path,
      name: 'WorldBook',
      kind: 'symlink',
      readable: true,
      writable: true,
    };
  }

  async readlink(): Promise<string> {
    return this.targetPath;
  }

  private async getTargetDirectory(): Promise<DirectoryNode | null> {
    // 当前 Character.worldbook alias 只允许指向 /Worldbooks/<name> 根目录。
    // 如果未来需要支持指向 worldbook 子目录或其他任意目录，再回到通用 resolve 方案。
    const parsed = parseVirtualPath(this.targetPath);
    if (parsed.rootKind !== 'lorebook' || parsed.relativePath !== null) {
      return null;
    }
    return new LorebookNode(parsed.entityName);
  }

  async getChild(name: string): Promise<Node | null> {
    const target = await this.getTargetDirectory();
    if (!target) {
      return null;
    }
    const child = await target.getChild(name);
    return child ? wrapWorldbookAliasNode(child, this.targetPath, this.path) : null;
  }

  async *list(): AsyncIterable<Node> {
    const target = await this.getTargetDirectory();
    if (!target) {
      return;
    }
    for await (const child of target.list()) {
      yield wrapWorldbookAliasNode(child, this.targetPath, this.path);
    }
  }

  async getWritableChild?(name: string): Promise<TextFileNode | null> {
    const target = await this.getTargetDirectory();
    if (!target || !isWritableDirectoryNode(target)) {
      return null;
    }
    const child = await target.getWritableChild(name);
    return child ? (wrapWorldbookAliasNode(child, child.path, `${this.path}/${name}`) as TextFileNode) : null;
  }
}
