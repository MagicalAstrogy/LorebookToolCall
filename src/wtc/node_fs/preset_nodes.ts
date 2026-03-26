import {
  deletePresetBoundFile,
  getSafePresetNames,
  hasPresetCurrentConflict,
  openPresetView,
  readPresetBoundFile,
  resolveCurrentPresetName,
  type PresetIndexedPrompt,
  type PresetView,
  writePresetBoundFile,
} from '@/wtc/fs_bind';
import { ConflictTextFileNode } from '@/wtc/node_fs/character_child_nodes';
import { basenameFromPath, findDirectoryFileSpan, listImmediateChildren, normalizeChildPath } from '@/wtc/node_fs/helpers';
import type {
  DeleteBackup,
  DeletableNode,
  DirectoryNode,
  Node,
  NodeStat,
  TextFileNode,
  TextFilePatch,
  WritableDirectoryNode,
} from '@/wtc/node_fs/types';
import { ToolError } from '@/wtc/result';
import { PRESETS_ROOT_NAME, PRESETS_ROOT_PATH, toPresetRootPath } from '@/wtc/store';

function applyTextEdit(text: string, patch: TextFilePatch) {
  const occurrences = text.split(patch.oldString).length - 1;
  if (occurrences === 0) {
    throw new ToolError('TEXT_NOT_FOUND', 'old_string 未在文件内容中找到。');
  }
  if (occurrences > 1 && patch.replaceAll !== true) {
    throw new ToolError('InputValidationError', 'old_string 命中多处，请显式指定 replace_all: true。', [
      {
        expected: 'replace_all 为 true 或 old_string 仅命中一次',
        received: JSON.stringify(patch.replaceAll ?? false),
        path: ['replace_all'],
      },
    ]);
  }
  return patch.replaceAll === true ? text.split(patch.oldString).join(patch.newString) : text.replace(patch.oldString, patch.newString);
}

function presetDirectoryExists(view: PresetView, actualPath: string) {
  return actualPath === view.rootPath || view.directories.includes(`${actualPath.replace(/\/+$/, '')}/`);
}

function relativePromptPathFromLogicalPath(path: string) {
  // /Presets/<PresetName>/... 的前三段固定是根目录、preset 名和实际 prompt 路径起点。
  return path.split('/').slice(3).join('/');
}

function listImmediateConflictNames(view: PresetView, actualDirectoryPath: string) {
  // 冲突集合里存的是完整路径；这里裁成“当前目录的直接冲突文件名”。
  const normalizedDirectory = actualDirectoryPath.replace(/\/+$/, '');
  const prefix = `${normalizedDirectory}/`;
  return [...view.conflicts]
    .filter(conflictPath => {
      if (!conflictPath.startsWith(prefix)) {
        return false;
      }
      const relative = conflictPath.slice(prefix.length);
      return relative !== '' && !relative.includes('/');
    })
    .map(conflictPath => conflictPath.slice(prefix.length))
    .sort();
}

export class PresetPromptNode implements TextFileNode, DeletableNode {
  public readonly exists = true;
  private lastWarnings: string[] = [];

  constructor(
    public readonly path: string,
    public readonly prompt: PresetIndexedPrompt,
  ) {}

  async stat(): Promise<NodeStat & { kind: 'file' }> {
    return {
      path: this.path,
      name: basenameFromPath(this.path),
      kind: 'file',
      readable: true,
      writable: true,
    };
  }

  async read(): Promise<string> {
    return readPresetBoundFile(this.path);
  }

  async write(content: string): Promise<void> {
    // Write action 需要把宿主 warning 带回工具层，这里临时缓存下来供 action 读取。
    const result = await writePresetBoundFile(this.path, content);
    this.lastWarnings = result.warnings;
  }

  async edit(patch: TextFilePatch) {
    const originalContent = await this.read();
    const updatedContent = applyTextEdit(originalContent, patch);
    await this.write(updatedContent);
    return {
      originalContent,
      updatedContent,
      replaceAll: patch.replaceAll === true,
    };
  }

  async delete(): Promise<void> {
    await deletePresetBoundFile(this.path);
  }

  async createDeleteBackup(): Promise<DeleteBackup> {
    return {
      rollbackMethod: 'deleteRollback',
      strategy: 'write',
      filePath: this.path,
      content: await this.read(),
    };
  }

  takeLastWarnings() {
    const warnings = [...this.lastWarnings];
    this.lastWarnings = [];
    return warnings;
  }
}

export class CreatablePresetPromptNode implements TextFileNode {
  public readonly exists = false;
  private lastWarnings: string[] = [];

  constructor(
    public readonly path: string,
    public readonly promptPath: string,
  ) {}

  async stat(): Promise<NodeStat & { kind: 'file' }> {
    return {
      path: this.path,
      name: basenameFromPath(this.path),
      kind: 'file',
      readable: false,
      writable: true,
    };
  }

  async read(): Promise<string> {
    throw new ToolError('ENTRY_NOT_FOUND', `条目 '${this.path}' 不存在。`);
  }

  async write(content: string): Promise<void> {
    const result = await writePresetBoundFile(this.path, content);
    this.lastWarnings = result.warnings;
  }

  async edit(): Promise<{ originalContent: string; updatedContent: string; replaceAll: boolean }> {
    throw new ToolError('ENTRY_NOT_FOUND', `条目 '${this.path}' 不存在。`);
  }

  takeLastWarnings() {
    const warnings = [...this.lastWarnings];
    this.lastWarnings = [];
    return warnings;
  }
}

export class PresetVirtualDirectoryNode implements WritableDirectoryNode {
  // actualPath 指向真实 preset 树中的目录；path 则保留逻辑路径，便于 Current alias 回显。
  constructor(
    public readonly view: PresetView,
    public readonly path: string,
    public readonly actualPath: string,
    public readonly fileStart: number,
    public readonly fileEnd: number,
  ) {}

  async stat(): Promise<NodeStat & { kind: 'directory' }> {
    return {
      path: this.path,
      name: basenameFromPath(this.path),
      kind: 'directory',
      readable: true,
      writable: true,
    };
  }

  async getChild(name: string): Promise<Node | null> {
    for (const child of listImmediateChildren(this.view, this.actualPath, this.fileStart, this.fileEnd)) {
      if (child.name !== name) {
        continue;
      }
      if (child.kind === 'directory') {
        return new PresetVirtualDirectoryNode(this.view, `${this.path}/${name}`, child.path, child.fileStart, child.fileEnd);
      }
      return new PresetPromptNode(`${this.path}/${name}`, child.entry);
    }

    const actualChildPath = normalizeChildPath(this.actualPath, name);
    if (!actualChildPath) {
      return null;
    }
    if (this.view.conflicts.has(actualChildPath)) {
      return new ConflictTextFileNode(`${this.path}/${name}`);
    }
    if (presetDirectoryExists(this.view, actualChildPath)) {
      const { fileStart, fileEnd } = findDirectoryFileSpan(this.view, actualChildPath);
      return new PresetVirtualDirectoryNode(this.view, `${this.path}/${name}`, actualChildPath, fileStart, fileEnd);
    }
    const prompt = this.view.exactFiles.get(actualChildPath);
    return prompt ? new PresetPromptNode(`${this.path}/${name}`, prompt) : null;
  }

  async *list(): AsyncIterable<Node> {
    const nodes: Node[] = [];
    for (const child of listImmediateChildren(this.view, this.actualPath, this.fileStart, this.fileEnd)) {
      if (child.kind === 'directory') {
        nodes.push(new PresetVirtualDirectoryNode(this.view, `${this.path}/${child.name}`, child.path, child.fileStart, child.fileEnd));
      } else {
        nodes.push(new PresetPromptNode(`${this.path}/${child.name}`, child.entry));
      }
    }
    // 冲突节点也要参与目录枚举，保证 glob/list 能看到冲突占位。
    for (const name of listImmediateConflictNames(this.view, this.actualPath)) {
      nodes.push(new ConflictTextFileNode(`${this.path}/${name}`));
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

  async getWritableChild(name: string): Promise<TextFileNode | null> {
    const existing = await this.getChild(name);
    if (existing && 'read' in existing) {
      return existing as TextFileNode;
    }
    if (existing) {
      return new ConflictTextFileNode(normalizeChildPath(this.path, name) ?? `${this.path}/${name}`);
    }
    const filePath = normalizeChildPath(this.path, name);
    const promptPath = filePath ? relativePromptPathFromLogicalPath(filePath) : null;
    return filePath && promptPath ? new CreatablePresetPromptNode(filePath, promptPath) : null;
  }
}

export class PresetNode implements WritableDirectoryNode {
  public readonly path: string;
  private readonly actualPath: string;

  constructor(
    public readonly presetName: string,
    public readonly actualPresetName: string = presetName,
  ) {
    this.path = toPresetRootPath(presetName);
    this.actualPath = toPresetRootPath(actualPresetName);
  }

  async stat(): Promise<NodeStat & { kind: 'directory' }> {
    return {
      path: this.path,
      name: this.presetName,
      kind: 'directory',
      readable: true,
      writable: true,
    };
  }

  openView() {
    // 和 LorebookNode 一样，每次操作都重新打开一份 view，不跨操作缓存。
    return openPresetView(this.actualPresetName);
  }

  async getChild(name: string): Promise<Node | null> {
    const view = this.openView();
    const { fileStart, fileEnd } = findDirectoryFileSpan(view, this.actualPath);
    for (const child of listImmediateChildren(view, this.actualPath, fileStart, fileEnd)) {
      if (child.name !== name) {
        continue;
      }
      if (child.kind === 'directory') {
        return new PresetVirtualDirectoryNode(view, `${this.path}/${name}`, child.path, child.fileStart, child.fileEnd);
      }
      return new PresetPromptNode(`${this.path}/${name}`, child.entry);
    }

    const actualChildPath = normalizeChildPath(this.actualPath, name);
    if (!actualChildPath) {
      return null;
    }
    if (view.conflicts.has(actualChildPath)) {
      return new ConflictTextFileNode(`${this.path}/${name}`);
    }
    const prompt = view.exactFiles.get(actualChildPath);
    return prompt ? new PresetPromptNode(`${this.path}/${name}`, prompt) : null;
  }

  async *list(): AsyncIterable<Node> {
    const view = this.openView();
    const { fileStart, fileEnd } = findDirectoryFileSpan(view, this.actualPath);
    const rootDirectory = new PresetVirtualDirectoryNode(view, this.path, this.actualPath, fileStart, fileEnd);
    yield* rootDirectory.list();
  }

  async getWritableChild(name: string): Promise<TextFileNode | null> {
    const existing = await this.getChild(name);
    if (existing && 'read' in existing) {
      return existing as TextFileNode;
    }
    if (existing) {
      return new ConflictTextFileNode(normalizeChildPath(this.path, name) ?? `${this.path}/${name}`);
    }
    const filePath = normalizeChildPath(this.path, name);
    return filePath ? new CreatablePresetPromptNode(filePath, name) : null;
  }
}

export class CurrentPresetConflictNode implements WritableDirectoryNode {
  // 当存在真实 preset 名为 Current 时，这个路径整体退化为冲突目录。
  constructor(public readonly path: string) {}

  async stat(): Promise<NodeStat & { kind: 'directory' }> {
    return {
      path: this.path,
      name: basenameFromPath(this.path),
      kind: 'directory',
      readable: true,
      writable: true,
    };
  }

  async getChild(name: string): Promise<Node | null> {
    return new CurrentPresetConflictNode(`${this.path}/${name}`);
  }

  async *list(): AsyncIterable<Node> {}

  async getWritableChild(name: string): Promise<TextFileNode | null> {
    return new ConflictTextFileNode(`${this.path}/${name}`);
  }
}

export class CurrentPresetLinkNode {
  public readonly path = `${PRESETS_ROOT_PATH}/Current`;

  constructor(public readonly targetPresetName: string) {}

  async stat(): Promise<NodeStat & { kind: 'symlink' }> {
    return {
      path: this.path,
      name: 'Current',
      kind: 'symlink',
      readable: true,
      writable: true,
    };
  }

  async readlink(): Promise<string> {
    return toPresetRootPath(this.targetPresetName);
  }

  private delegate() {
    // Current 只是逻辑别名；具体目录行为仍委托给 PresetNode。
    return new PresetNode('Current', this.targetPresetName);
  }

  async getChild(name: string): Promise<Node | null> {
    return this.delegate().getChild(name);
  }

  async *list(): AsyncIterable<Node> {
    yield* this.delegate().list();
  }

  async getWritableChild(name: string): Promise<TextFileNode | null> {
    return this.delegate().getWritableChild(name);
  }
}

export class PresetsRootNode implements DirectoryNode {
  public readonly path = PRESETS_ROOT_PATH;

  async stat(): Promise<NodeStat & { kind: 'directory' }> {
    return {
      path: this.path,
      name: PRESETS_ROOT_NAME,
      kind: 'directory',
      readable: true,
      writable: false,
    };
  }

  async getChild(name: string): Promise<Node | null> {
    if (name === 'Current') {
      // Current 优先按保留别名解释；只有无冲突且目标可读时才暴露为链接。
      if (hasPresetCurrentConflict()) {
        return new CurrentPresetConflictNode(`${this.path}/Current`);
      }
      const currentPresetName = resolveCurrentPresetName();
      return currentPresetName ? new CurrentPresetLinkNode(currentPresetName) : null;
    }
    return getSafePresetNames().includes(name) ? new PresetNode(name) : null;
  }

  async *list(): AsyncIterable<Node> {
    const names = getSafePresetNames().filter(name => name !== 'Current');
    for (const name of names) {
      yield new PresetNode(name);
    }
    if (hasPresetCurrentConflict()) {
      yield new CurrentPresetConflictNode(`${this.path}/Current`);
      return;
    }
    const currentPresetName = resolveCurrentPresetName();
    if (currentPresetName) {
      yield new CurrentPresetLinkNode(currentPresetName);
    }
  }
}
