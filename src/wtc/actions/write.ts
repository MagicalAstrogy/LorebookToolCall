import type { z } from 'zod';
import { ensureLorebookPermission } from '@/wtc/permission';
import { ToolError } from '@/wtc/result';
import { writeArgsSchema } from '@/wtc/schema';
import {
  basenameFromEntryPath,
  createStructuredPatch,
  ensureNoConflict,
  findRawBookEntry,
  loadRawWorldbook,
  requireFileTarget,
  saveRawWorldbook,
  withWorldbookQueue,
} from '@/wtc/store';
import { getIndexForWorldbook, readEntryContent } from '@/wtc/actions/shared';

export type WriteBackup =
  | {
      // create 场景回滚依赖 uid 删除刚创建的条目。
      rollbackMethod: 'writeRollback';
      mode: 'create';
      worldbookName: string;
      filePath: string;
      uid: number;
    }
  | {
      // update 场景回滚只需要恢复写入前的完整内容。
      rollbackMethod: 'writeRollback';
      mode: 'update';
      worldbookName: string;
      filePath: string;
      uid: number;
      originalContent: string;
    };

/**
 * 回滚方式：
 * 将本次 `writeAction()` 返回的 `backup` 原样传给 `writeRollback()`，
 * `create` 会删除刚创建的条目，`update` 会把内容恢复到写入前。
 */
export async function writeRollback(backup: WriteBackup) {
  if (backup.mode === 'create') {
    await ensureLorebookPermission(backup.worldbookName, 'delete');
    return withWorldbookQueue(backup.worldbookName, async () => {
      // create 的回滚语义就是删除本次新增出来的条目。
      const { deleted_entries } = await deleteWorldbookEntries(backup.worldbookName, entry => entry.uid === backup.uid);
      if (deleted_entries.length === 0) {
        throw new ToolError('ENTRY_NOT_FOUND', `条目 '${backup.filePath}' 不存在，无法回滚创建操作。`);
      }
      return {
        filePath: backup.filePath,
        rolledBack: true,
      };
    });
  }

  await ensureLorebookPermission(backup.worldbookName, 'write');
  return withWorldbookQueue(backup.worldbookName, async () => {
    await updateWorldbookWith(backup.worldbookName, worldbook => {
      let found = false;
      const restored = worldbook.map(entry => {
        if (entry.uid !== backup.uid) {
          return entry;
        }
        found = true;
        // update 的回滚直接恢复写入前的内容，不影响其他字段。
        return { ...entry, content: backup.originalContent };
      });
      if (!found) {
        throw new ToolError('ENTRY_NOT_FOUND', `条目 '${backup.filePath}' 不存在，无法回滚写入操作。`);
      }
      return restored;
    });

    return {
      filePath: backup.filePath,
      rolledBack: true,
    };
  });
}

export async function writeAction(args: z.infer<typeof writeArgsSchema>) {
  const { normalized, worldbookName, entryPath } = requireFileTarget(args.file_path);
  await ensureLorebookPermission(worldbookName, 'write');

  return withWorldbookQueue(worldbookName, async () => {
    const { index } = await getIndexForWorldbook(worldbookName);
    ensureNoConflict(index, normalized);
    const existing = index.exactFiles.get(normalized);
    if (existing) {
      // 路径已存在时按覆盖写入处理，并返回结构化 patch 方便模型理解变更。
      const original = await readEntryContent(normalized);
      await updateWorldbookWith(worldbookName, worldbook =>
        worldbook.map(entry => (entry.uid === existing.uid ? { ...entry, content: args.content } : entry)),
      );
      return {
        type: 'update' as const,
        filePath: normalized,
        content: args.content,
        structuredPatch: createStructuredPatch(original, args.content),
        originalFile: original,
        backup: {
          // 回滚时按 uid 把 content 恢复成写入前的原文。
          rollbackMethod: 'writeRollback' as const,
          mode: 'update' as const,
          worldbookName,
          filePath: normalized,
          uid: existing.uid,
          originalContent: original,
        },
      };
    }

    const { new_entries } = await createWorldbookEntries(worldbookName, [
      {
        name: basenameFromEntryPath(entryPath),
        content: args.content,
      },
    ]);
    // 底层创建接口不会替我们设置 comment，所以需要回写成目标虚拟路径。
    const created = new_entries[0];
    const reloaded = await loadRawWorldbook(worldbookName);
    //@ts-expect-error 类型定义不符
    const raw = findRawBookEntry(reloaded, entry => entry.uid === created.uid);
    if (!raw) {
      throw new ToolError('tool_use_error', '创建条目后无法在世界书中定位新条目。');
    }
    raw.comment = entryPath;
    raw.content = args.content;
    await saveRawWorldbook(worldbookName, reloaded);
    return {
      type: 'create' as const,
      filePath: normalized,
      content: args.content,
      structuredPatch: [],
      originalFile: null,
      backup: {
        // 回滚时按 uid 删除本次 create 新增的条目。
        rollbackMethod: 'writeRollback' as const,
        mode: 'create' as const,
        worldbookName,
        filePath: normalized,
        uid: created.uid,
      },
    };
  });
}
