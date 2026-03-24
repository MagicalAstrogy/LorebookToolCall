import type { z } from 'zod';
import { ensureLorebookPermission } from '@/wtc/permission';
import { ToolError } from '@/wtc/result';
import { editArgsSchema } from '@/wtc/schema';
import { createStructuredPatch, requireFileTarget, withWorldbookQueue } from '@/wtc/store';
import { resolveFileNode } from '@/wtc/node_fs/nodes';

const MAX_INLINE_ORIGINAL_FILE_LENGTH = 5000;

export type EditBackup = {
  // Edit 的回滚始终基于编辑前的完整原文恢复 content。
  rollbackMethod: 'editRollback';
  worldbookName: string;
  filePath: string;
  uid: number;
  originalContent: string;
};

/**
 * 回滚方式：
 * 将本次 `editAction()` 返回的 `backup` 原样传给 `editRollback()`，
 * 它会直接把条目内容恢复到编辑前的完整文本。
 */
export async function editRollback(backup: EditBackup) {
  await ensureLorebookPermission(backup.worldbookName, 'write');
  return withWorldbookQueue(backup.worldbookName, async () => {
    await updateWorldbookWith(backup.worldbookName, worldbook => {
      let found = false;
      const restored = worldbook.map(entry => {
        if (entry.uid !== backup.uid) {
          return entry;
        }
        found = true;
        // Edit 只改 content，因此回滚时直接恢复编辑前的整段文本。
        return { ...entry, content: backup.originalContent };
      });
      if (!found) {
        throw new ToolError('ENTRY_NOT_FOUND', `条目 '${backup.filePath}' 不存在，无法回滚编辑操作。`);
      }
      return restored;
    });

    return {
      filePath: backup.filePath,
      rolledBack: true,
    };
  });
}

export async function editAction(args: z.infer<typeof editArgsSchema>) {
  const { normalized, worldbookName } = requireFileTarget(args.file_path);
  await ensureLorebookPermission(worldbookName, 'write');

  return withWorldbookQueue(worldbookName, async () => {
    const node = await resolveFileNode(normalized);
    if (!node) {
      throw new ToolError('ENTRY_NOT_FOUND', `条目 '${normalized}' 不存在。`);
    }

    const { originalContent: original, updatedContent: updated, replaceAll } = await node.edit({
      oldString: args.old_string,
      newString: args.new_string,
      replaceAll: args.replace_all,
    });

    const originalFileTooLarge = original.length > MAX_INLINE_ORIGINAL_FILE_LENGTH;
    return {
      filePath: normalized,
      oldString: args.old_string,
      newString: args.new_string,
      originalFile: originalFileTooLarge ? null : original,
      originalFileNotice: originalFileTooLarge
        ? `原始内容超过 ${MAX_INLINE_ORIGINAL_FILE_LENGTH} 字符，未直接返回。`
        : undefined,
      structuredPatch: createStructuredPatch(original, updated),
      userModified: false,
      replaceAll,
      backup: {
        // 回滚时按 uid 把 content 恢复成 edit 前的完整文本。
        rollbackMethod: 'editRollback' as const,
        worldbookName,
        filePath: normalized,
        uid: node.uid,
        originalContent: original,
      },
    };
  });
}
