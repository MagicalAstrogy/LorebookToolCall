import { ToolError } from '@/wtc/result';
import { applyWorldbookPatch, basenameFromEntryPath, findRawBookEntry, loadRawWorldbook, saveRawWorldbook } from '@/wtc/store';
import type { AttributeNode, DeleteBackup, DeletableNode, LorebookView, NodeStat, TextFileNode } from '@/wtc/node_fs/types';

export class LorebookEntryNode implements TextFileNode, AttributeNode, DeletableNode {
  public readonly exists = true;
  public readonly path: string;
  public readonly lorebookName: string;

  constructor(
    public readonly view: LorebookView,
    public readonly entry: LorebookView['files'][number],
  ) {
    // LorebookEntryNode 绑定到某一次 view，不保证跨 view 的对象身份稳定。
    this.path = entry.filePath;
    this.lorebookName = view.worldbookName;
  }

  get uid() {
    return this.entry.uid;
  }

  /** 返回当前世界书条目节点的基础信息。 */
  async stat(): Promise<NodeStat & { kind: 'file' }> {
    return {
      path: this.path,
      name: basenameFromEntryPath(this.entry.entryPath),
      kind: 'file',
      readable: true,
      writable: true,
    };
  }

  /** 读取条目正文，可选按行偏移和截断。 */
  async read(opts?: { offset?: number; limit?: number }): Promise<string> {
    const content = this.entry.raw.content;
    if (!opts) {
      return content;
    }
    const offset = opts.offset ?? 0;
    const limit = opts.limit ?? 0;
    const lines = content.split('\n');
    return (limit === 0 ? lines.slice(offset) : lines.slice(offset, offset + limit)).join('\n');
  }

  /** 用完整内容覆盖写入条目正文。 */
  async write(content: string): Promise<void> {
    // 写入直接落到宿主世界书；当前 node 自身不维护缓存同步。
    await updateWorldbookWith(this.lorebookName, worldbook =>
      worldbook.map(rawEntry => (rawEntry.uid === this.uid ? { ...rawEntry, content } : rawEntry)),
    );
    this.entry.raw.content = content;
  }

  /** 在条目正文中执行精确字符串替换。 */
  async edit(patch: {
    oldString: string;
    newString: string;
    replaceAll?: boolean;
  }): Promise<{ originalContent: string; updatedContent: string; replaceAll: boolean }> {
    const originalContent = this.entry.raw.content;
    const occurrences = originalContent.split(patch.oldString).length - 1;
    if (occurrences === 0) {
      throw new ToolError('TEXT_NOT_FOUND', 'old_string 未在条目内容中找到。');
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
    const updatedContent =
      patch.replaceAll === true
        ? originalContent.split(patch.oldString).join(patch.newString)
        : originalContent.replace(patch.oldString, patch.newString);
    await this.write(updatedContent);
    return {
      originalContent,
      updatedContent,
      replaceAll: patch.replaceAll === true,
    };
  }

  /** 删除当前条目。 */
  async delete(): Promise<void> {
    const { deleted_entries } = await deleteWorldbookEntries(this.lorebookName, rawEntry => rawEntry.uid === this.uid);
    if (deleted_entries.length === 0) {
      throw new ToolError('ENTRY_NOT_FOUND', `条目 '${this.path}' 不存在。`);
    }
  }

  /** 生成删除前快照，用于通用 deleteRollback 恢复。 */
  async createDeleteBackup(): Promise<DeleteBackup> {
    const attributes = await this.getattr();
    const { uid: _uid, comment: _comment, content: _content, ...rest } = attributes as Record<string, unknown> & {
      uid?: unknown;
      comment?: unknown;
      content?: unknown;
    };
    return {
      rollbackMethod: 'deleteRollback',
      strategy: 'write',
      filePath: this.path,
      content: this.entry.raw.content,
      attributes: rest,
    };
  }

  /** 读取当前条目的元数据属性。 */
  async getattr(): Promise<Record<string, unknown>> {
    const worldbook = await getWorldbook(this.lorebookName);
    const attributes = worldbook.find(rawEntry => rawEntry.uid === this.uid);
    if (!attributes) {
      throw new ToolError('tool_use_error', '无法从高层世界书接口定位条目属性。');
    }
    return attributes as Record<string, unknown>;
  }

  /** 对当前条目的元数据属性应用补丁。 */
  async setattr(patch: Record<string, unknown>): Promise<Record<string, unknown>> {
    let updatedEntry: WorldbookEntry | undefined;
    await updateWorldbookWith(this.lorebookName, worldbook =>
      worldbook.map(rawEntry => {
        if (rawEntry.uid !== this.uid) {
          return rawEntry;
        }
        updatedEntry = applyWorldbookPatch(rawEntry, patch);
        return updatedEntry;
      }),
    );
    if (!updatedEntry) {
      throw new ToolError('ENTRY_NOT_FOUND', `条目 '${this.path}' 不存在。`);
    }
    return updatedEntry as Record<string, unknown>;
  }
}

export class CreatableLorebookEntryNode implements TextFileNode {
  public readonly exists = false;
  private createdUid?: number;

  constructor(
    public readonly worldbookName: string,
    public readonly path: string,
    public readonly entryPath: string,
  ) {}

  /** 返回一个尚未持久存在、但可通过 write 创建的世界书条目节点。 */
  async stat(): Promise<NodeStat & { kind: 'file' }> {
    return {
      path: this.path,
      name: basenameFromEntryPath(this.entryPath),
      kind: 'file',
      readable: false,
      writable: true,
    };
  }

  async read(): Promise<string> {
    throw new ToolError('ENTRY_NOT_FOUND', `条目 '${this.path}' 不存在。`);
  }

  async write(content: string): Promise<void> {
    const { new_entries } = await createWorldbookEntries(this.worldbookName, [
      {
        name: basenameFromEntryPath(this.entryPath),
        content,
      },
    ]);
    const created = new_entries[0];
    this.createdUid = created.uid;
    const reloaded = await loadRawWorldbook(this.worldbookName);
    //@ts-expect-error 类型定义不符
    const raw = findRawBookEntry(reloaded, entry => entry.uid === created.uid);
    if (!raw) {
      throw new ToolError('tool_use_error', '创建条目后无法在世界书中定位新条目。');
    }
    raw.comment = this.entryPath;
    raw.content = content;
    await saveRawWorldbook(this.worldbookName, reloaded);
  }

  async edit(): Promise<{ originalContent: string; updatedContent: string; replaceAll: boolean }> {
    throw new ToolError('ENTRY_NOT_FOUND', `条目 '${this.path}' 不存在。`);
  }

  get uid() {
    return this.createdUid;
  }
}
