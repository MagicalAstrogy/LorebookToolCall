import { presetPromptFrontMatterSchema, scriptFrontMatterSchema, tavernRegexFrontMatterSchema } from '@/wtc/fs_bind';
import { basenameFromPath } from '@/wtc/node_fs/helpers';
import type { DeletableNode, DirectoryNode, Node, NodeStat, TextFileNode, TextFilePatch } from '@/wtc/node_fs/types';
import { ToolError } from '@/wtc/result';
import { validationSchemaToJson } from '@/wtc/schema';
import { SCHEMAS_ROOT_NAME, SCHEMAS_ROOT_PATH } from '@/wtc/store';

const SCHEMA_FILE_BUILDERS = {
  // 这些 schema 都是只读导出；这里集中维护文件名到 builder 的映射。
  'Preset.json': () => validationSchemaToJson(presetPromptFrontMatterSchema),
  'Regex.json': () => validationSchemaToJson(tavernRegexFrontMatterSchema),
  'Script.json': () => validationSchemaToJson(scriptFrontMatterSchema),
} satisfies Record<string, () => Record<string, any>>;

function schemaFileNames() {
  return Object.keys(SCHEMA_FILE_BUILDERS).sort();
}

function readOnlySchemaMessage(path: string, action: '写入' | '编辑' | '删除') {
  return `条目 '${path}' 是只读的 Schema 导出，不支持${action}。`;
}

export class ReadonlySchemaFileNode implements TextFileNode, DeletableNode {
  public readonly exists = true;

  constructor(
    public readonly path: string,
    public readonly fileName: keyof typeof SCHEMA_FILE_BUILDERS,
  ) {}

  async stat(): Promise<NodeStat & { kind: 'file' }> {
    return {
      path: this.path,
      name: basenameFromPath(this.path),
      kind: 'file',
      readable: true,
      writable: false,
    };
  }

  private renderContent() {
    return JSON.stringify(SCHEMA_FILE_BUILDERS[this.fileName](), null, 2);
  }

  async read(opts?: { offset?: number; limit?: number }): Promise<string> {
    const content = this.renderContent();
    if (!opts) {
      return content;
    }
    const offset = opts.offset ?? 0;
    const limit = opts.limit ?? 0;
    const lines = content.split('\n');
    return (limit === 0 ? lines.slice(offset) : lines.slice(offset, offset + limit)).join('\n');
  }

  async write(): Promise<void> {
    throw new ToolError('InputValidationError', readOnlySchemaMessage(this.path, '写入'));
  }

  async edit(_patch: TextFilePatch): Promise<{ originalContent: string; updatedContent: string; replaceAll: boolean }> {
    throw new ToolError('InputValidationError', readOnlySchemaMessage(this.path, '编辑'));
  }

  async delete(): Promise<void> {
    throw new ToolError('InputValidationError', readOnlySchemaMessage(this.path, '删除'));
  }
}

export class SchemasRootNode implements DirectoryNode {
  public readonly path = SCHEMAS_ROOT_PATH;

  async stat(): Promise<NodeStat & { kind: 'directory' }> {
    return {
      path: this.path,
      name: SCHEMAS_ROOT_NAME,
      kind: 'directory',
      readable: true,
      writable: false,
    };
  }

  async getChild(name: string): Promise<Node | null> {
    if (!(name in SCHEMA_FILE_BUILDERS)) {
      return null;
    }
    return new ReadonlySchemaFileNode(`${this.path}/${name}`, name as keyof typeof SCHEMA_FILE_BUILDERS);
  }

  async *list(): AsyncIterable<Node> {
    for (const name of schemaFileNames()) {
      yield new ReadonlySchemaFileNode(`${this.path}/${name}`, name as keyof typeof SCHEMA_FILE_BUILDERS);
    }
  }
}
