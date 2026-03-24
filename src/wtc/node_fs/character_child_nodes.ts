import { deleteCharacterBoundFile, openCharacterView, readCharacterBoundFile, writeCharacterBoundFile } from '@/wtc/fs_bind';
import type {
  DeleteBackup,
  DeletableNode,
  Node,
  NodeStat,
  TextFileNode,
  TextFilePatch,
  WritableDirectoryNode,
} from '@/wtc/node_fs/types';
import { basenameFromPath } from '@/wtc/node_fs/helpers';
import { ToolError } from '@/wtc/result';

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

export class ConflictTextFileNode implements TextFileNode, DeletableNode {
  public readonly exists = true;
  constructor(public readonly path: string) {}

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
    throw new ToolError('PATH_CONFLICT', `路径 '${this.path}' 存在重名冲突。`);
  }

  async write(): Promise<void> {
    throw new ToolError('PATH_CONFLICT', `路径 '${this.path}' 存在重名冲突。`);
  }

  async edit(): Promise<{ originalContent: string; updatedContent: string; replaceAll: boolean }> {
    throw new ToolError('PATH_CONFLICT', `路径 '${this.path}' 存在重名冲突。`);
  }

  async delete(): Promise<void> {
    throw new ToolError('PATH_CONFLICT', `路径 '${this.path}' 存在重名冲突。`);
  }
}

export class CharacterDescriptionNode implements TextFileNode {
  public readonly exists = true;
  constructor(public readonly characterName: string, public readonly path: string) {}

  async stat(): Promise<NodeStat & { kind: 'file' }> {
    return {
      path: this.path,
      name: 'Description.md',
      kind: 'file',
      readable: true,
      writable: true,
    };
  }

  async read(): Promise<string> {
    return readCharacterBoundFile(this.path);
  }

  async write(content: string): Promise<void> {
    await writeCharacterBoundFile(this.path, content);
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
}

export class CharacterFirstMessageNode implements TextFileNode, DeletableNode {
  public readonly exists = true;
  constructor(
    public readonly path: string,
    public readonly index: number,
    public readonly characterName: string = path.split('/')[2],
  ) {}

  async stat(): Promise<NodeStat & { kind: 'file' }> {
    return {
      path: this.path,
      name: String(this.index),
      kind: 'file',
      readable: true,
      writable: true,
    };
  }

  async read(): Promise<string> {
    return readCharacterBoundFile(this.path);
  }

  async write(content: string): Promise<void> {
    await writeCharacterBoundFile(this.path, content);
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
    await deleteCharacterBoundFile(this.path);
  }

  async createDeleteBackup(): Promise<DeleteBackup> {
    return {
      rollbackMethod: 'deleteRollback',
      strategy: 'insert_character_first_message',
      filePath: this.path,
      characterName: this.characterName,
      index: this.index,
      content: await this.read(),
    };
  }
}

export class CreatableCharacterFirstMessageNode implements TextFileNode {
  public readonly exists = false;

  constructor(public readonly path: string, public readonly index: number) {}

  async stat(): Promise<NodeStat & { kind: 'file' }> {
    return {
      path: this.path,
      name: String(this.index),
      kind: 'file',
      readable: false,
      writable: true,
    };
  }

  async read(): Promise<string> {
    throw new ToolError('ENTRY_NOT_FOUND', `条目 '${this.path}' 不存在。`);
  }

  async write(content: string): Promise<void> {
    await writeCharacterBoundFile(this.path, content);
  }

  async edit(): Promise<{ originalContent: string; updatedContent: string; replaceAll: boolean }> {
    throw new ToolError('ENTRY_NOT_FOUND', `条目 '${this.path}' 不存在。`);
  }
}

export class CharacterRegexNode implements TextFileNode, DeletableNode {
  public readonly exists = true;
  private lastWarnings: string[] = [];
  constructor(public readonly path: string, public readonly scriptName: string) {}

  async stat(): Promise<NodeStat & { kind: 'file' }> {
    return {
      path: this.path,
      name: this.scriptName,
      kind: 'file',
      readable: true,
      writable: true,
    };
  }

  async read(): Promise<string> {
    return readCharacterBoundFile(this.path);
  }

  async write(content: string): Promise<void> {
    const result = await writeCharacterBoundFile(this.path, content);
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
    await deleteCharacterBoundFile(this.path);
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

export class CreatableCharacterRegexNode implements TextFileNode {
  public readonly exists = false;
  private lastWarnings: string[] = [];

  constructor(public readonly path: string, public readonly scriptName: string) {}

  async stat(): Promise<NodeStat & { kind: 'file' }> {
    return {
      path: this.path,
      name: this.scriptName,
      kind: 'file',
      readable: false,
      writable: true,
    };
  }

  async read(): Promise<string> {
    throw new ToolError('ENTRY_NOT_FOUND', `条目 '${this.path}' 不存在。`);
  }

  async write(content: string): Promise<void> {
    const result = await writeCharacterBoundFile(this.path, content);
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

export class CharacterScriptNode implements TextFileNode, DeletableNode {
  public readonly exists = true;
  private lastWarnings: string[] = [];
  constructor(public readonly path: string, public readonly scriptName: string) {}

  async stat(): Promise<NodeStat & { kind: 'file' }> {
    return {
      path: this.path,
      name: this.scriptName,
      kind: 'file',
      readable: true,
      writable: true,
    };
  }

  async read(): Promise<string> {
    return readCharacterBoundFile(this.path);
  }

  async write(content: string): Promise<void> {
    const result = await writeCharacterBoundFile(this.path, content);
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
    await deleteCharacterBoundFile(this.path);
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

export class CreatableCharacterScriptNode implements TextFileNode {
  public readonly exists = false;
  private lastWarnings: string[] = [];

  constructor(public readonly path: string, public readonly scriptName: string) {}

  async stat(): Promise<NodeStat & { kind: 'file' }> {
    return {
      path: this.path,
      name: this.scriptName,
      kind: 'file',
      readable: false,
      writable: true,
    };
  }

  async read(): Promise<string> {
    throw new ToolError('ENTRY_NOT_FOUND', `条目 '${this.path}' 不存在。`);
  }

  async write(content: string): Promise<void> {
    const result = await writeCharacterBoundFile(this.path, content);
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

export class CharacterFirstMessagesDirectoryNode implements WritableDirectoryNode {
  constructor(public readonly characterName: string, public readonly path: string) {}

  async stat(): Promise<NodeStat & { kind: 'directory' }> {
    return {
      path: this.path,
      name: 'FirstMessages',
      kind: 'directory',
      readable: true,
      writable: true,
    };
  }

  async getChild(name: string): Promise<Node | null> {
    if (!/^\d+$/.test(name)) {
      return null;
    }
    const index = Number(name);
    const view = await openCharacterView(this.characterName);
    return index < view.character.first_messages.length ? new CharacterFirstMessageNode(`${this.path}/${name}`, index) : null;
  }

  async getWritableChild(name: string): Promise<TextFileNode | null> {
    if (!/^\d+$/.test(name)) {
      return null;
    }
    const index = Number(name);
    const existing = await this.getChild(name);
    return existing && 'read' in existing ? (existing as TextFileNode) : new CreatableCharacterFirstMessageNode(`${this.path}/${name}`, index);
  }

  async *list(): AsyncIterable<Node> {
    const view = await openCharacterView(this.characterName);
    for (let index = 0; index < view.character.first_messages.length; index += 1) {
      yield new CharacterFirstMessageNode(`${this.path}/${index}`, index);
    }
  }
}

export class CharacterRegexDirectoryNode implements WritableDirectoryNode {
  constructor(public readonly characterName: string, public readonly path: string) {}

  async stat(): Promise<NodeStat & { kind: 'directory' }> {
    return {
      path: this.path,
      name: 'Regex',
      kind: 'directory',
      readable: true,
      writable: true,
    };
  }

  async getChild(name: string): Promise<Node | null> {
    const view = await openCharacterView(this.characterName);
    if (view.regexConflicts.has(name)) {
      return new ConflictTextFileNode(`${this.path}/${name}`);
    }
    return view.regexByName.has(name) ? new CharacterRegexNode(`${this.path}/${name}`, name) : null;
  }

  async getWritableChild(name: string): Promise<TextFileNode | null> {
    const existing = await this.getChild(name);
    if (existing && 'read' in existing) {
      return existing as TextFileNode;
    }
    return new CreatableCharacterRegexNode(`${this.path}/${name}`, name);
  }

  async *list(): AsyncIterable<Node> {
    const view = await openCharacterView(this.characterName);
    const names = [...view.regexByName.keys(), ...view.regexConflicts].sort();
    for (const name of names) {
      if (view.regexConflicts.has(name)) {
        yield new ConflictTextFileNode(`${this.path}/${name}`);
      } else {
        yield new CharacterRegexNode(`${this.path}/${name}`, name);
      }
    }
  }
}

export class CharacterScriptsDirectoryNode implements WritableDirectoryNode {
  constructor(public readonly characterName: string, public readonly path: string) {}

  async stat(): Promise<NodeStat & { kind: 'directory' }> {
    return {
      path: this.path,
      name: 'Scripts',
      kind: 'directory',
      readable: true,
      writable: true,
    };
  }

  async getChild(name: string): Promise<Node | null> {
    const view = await openCharacterView(this.characterName);
    if (view.scriptConflicts.has(name)) {
      return new ConflictTextFileNode(`${this.path}/${name}`);
    }
    return view.scriptsByName.has(name) ? new CharacterScriptNode(`${this.path}/${name}`, name) : null;
  }

  async getWritableChild(name: string): Promise<TextFileNode | null> {
    const existing = await this.getChild(name);
    if (existing && 'read' in existing) {
      return existing as TextFileNode;
    }
    return new CreatableCharacterScriptNode(`${this.path}/${name}`, name);
  }

  async *list(): AsyncIterable<Node> {
    const view = await openCharacterView(this.characterName);
    const names = [...view.scriptsByName.keys(), ...view.scriptConflicts].sort();
    for (const name of names) {
      if (view.scriptConflicts.has(name)) {
        yield new ConflictTextFileNode(`${this.path}/${name}`);
      } else {
        yield new CharacterScriptNode(`${this.path}/${name}`, name);
      }
    }
  }
}
