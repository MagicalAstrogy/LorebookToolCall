import type { IndexedEntry, PathMappedEntry } from '@/wtc/store';

export type NodeKind = 'directory' | 'file';
export type ExtendedNodeKind = NodeKind | 'symlink';

export interface NodeStat {
  // 节点在整棵 Node FS 中的绝对路径，如 "/Worldbooks/设定集/NPC/理理"。
  path: string;
  // 节点在父目录中的局部名字，不携带父路径。
  name: string;
  kind: ExtendedNodeKind;
  readable: boolean;
  writable: boolean;
}

export interface Node {
  readonly path: string;
  // stat 总是返回绝对路径；相对路径属于遍历/展示上下文，不放在 stat 中。
  /** 返回当前节点的基础信息。 */
  stat(): Promise<NodeStat>;
}

export interface DirectoryNode extends Node {
  stat(): Promise<NodeStat & { kind: 'directory' }>;
  // 按当前目录下的局部名字读取直接子节点。
  /** 读取当前目录下指定名字的直接子节点。 */
  getChild(name: string): Promise<Node | null>;
  // 列出当前目录的直接子节点；不递归，不缓存结果。
  /** 逐个产出当前目录的直接子节点。每次调用都返回新的单次迭代流。 */
  list(): AsyncIterable<Node>;
  // mount 是目录专有行为；当前阶段仅根目录可能需要实现。
  /** 将一个节点挂载到当前目录下的指定名字。 */
  mount?(name: string, node: Node): Promise<void> | void;
}

export interface WritableDirectoryNode extends DirectoryNode {
  /** 读取当前目录下可写入的子文件节点；允许返回“尚不存在但可通过 write 创建”的占位节点。 */
  getWritableChild(name: string): Promise<TextFileNode | null>;
}

export interface SymlinkNode extends Node {
  stat(): Promise<NodeStat & { kind: 'symlink' }>;
  /** 返回软链接目标的绝对虚拟路径。 */
  readlink(): Promise<string>;
}

export interface TextFilePatch {
  oldString: string;
  newString: string;
  replaceAll?: boolean;
}

export interface TextFileNode extends Node {
  stat(): Promise<NodeStat & { kind: 'file' }>;
  /** 当前文件节点是否已经持久存在。create-on-write 占位节点会返回 false。 */
  readonly exists: boolean;
  // read/write/edit 都只作用于文件正文，不涉及属性。
  /** 读取文件正文，可选按行偏移和截断。 */
  read(opts?: { offset?: number; limit?: number }): Promise<string>;
  /** 用完整内容覆盖写入文件正文。 */
  write(content: string): Promise<void>;
  /** 在文件正文中执行精确字符串替换。 */
  edit(patch: TextFilePatch): Promise<{ originalContent: string; updatedContent: string; replaceAll: boolean }>;
}

export interface AttributeNode extends Node {
  // getattr/setattr 只处理条目元数据，不处理正文内容。
  /** 读取节点的元数据属性。 */
  getattr(): Promise<Record<string, unknown>>;
  /** 对节点的元数据属性应用补丁。 */
  setattr(patch: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export interface DeletableNode extends Node {
  /** 删除当前节点。 */
  delete(): Promise<void>;
}

export type DeleteBackup =
  | {
      rollbackMethod: 'deleteRollback';
      strategy: 'write';
      filePath: string;
      content: string;
      attributes?: Record<string, unknown>;
    }
  | {
      rollbackMethod: 'deleteRollback';
      strategy: 'insert_character_first_message';
      filePath: string;
      characterName: string;
      index: number;
      content: string;
    };

export interface DeleteBackupCapableNode extends DeletableNode {
  /** 生成删除前快照，供 deleteRollback 使用。 */
  createDeleteBackup(): Promise<DeleteBackup>;
}

// PathMappedView 抽象出“路径树 + 精确文件索引 + 冲突集合”这套通用结构，供 Lorebook/Preset 复用。
export interface PathMappedView<TEntry extends PathMappedEntry = PathMappedEntry> {
  rootPath: string;
  files: TEntry[];
  directories: string[];
  exactFiles: Map<string, TEntry>;
  conflicts: Set<string>;
}

export interface LorebookView extends PathMappedView<IndexedEntry> {
  // 这是一份“单次操作范围内”的有序视图，用于支撑遍历与解析。
  worldbookName: string;
}

export function isDirectoryNode(node: Node): node is DirectoryNode {
  return 'list' in node && typeof node.list === 'function' && 'getChild' in node;
}

export function isTextFileNode(node: Node): node is TextFileNode {
  return 'read' in node && typeof node.read === 'function' && 'write' in node && typeof node.write === 'function';
}

export function isAttributeNode(node: Node): node is AttributeNode {
  return 'getattr' in node && typeof node.getattr === 'function' && 'setattr' in node && typeof node.setattr === 'function';
}

export function isDeletableNode(node: Node): node is DeletableNode {
  return 'delete' in node && typeof node.delete === 'function';
}

export function isDeleteBackupCapableNode(node: Node): node is DeleteBackupCapableNode {
  return isDeletableNode(node) && 'createDeleteBackup' in node && typeof node.createDeleteBackup === 'function';
}

export function isSymlinkNode(node: Node): node is SymlinkNode {
  return 'readlink' in node && typeof node.readlink === 'function';
}

export function isWritableDirectoryNode(node: Node): node is WritableDirectoryNode {
  return 'getWritableChild' in node && typeof node.getWritableChild === 'function';
}
