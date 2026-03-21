import type { z } from 'zod';
import { ensureLorebookPermission } from '@/wtc/permission';
import { ToolError } from '@/wtc/result';
import { editArgsSchema } from '@/wtc/schema';
import { createStructuredPatch, ensureNoConflict, requireFileTarget, withWorldbookQueue } from '@/wtc/store';
import { getIndexForWorldbook, readEntryContent } from '@/wtc/actions/shared';

const MAX_INLINE_ORIGINAL_FILE_LENGTH = 5000;

export type EditBackup = {
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
    const original = await readEntryContent(normalized);
    const occurrences = original.split(args.old_string).length - 1;
    if (occurrences === 0) {
      throw new ToolError('TEXT_NOT_FOUND', 'old_string 未在条目内容中找到。');
    }
    // 默认只允许单次替换，避免模型在多命中时无意改坏整篇内容。
    if (occurrences > 1 && args.replace_all !== true) {
      throw new ToolError('InputValidationError', 'old_string 命中多处，请显式指定 replace_all: true。', [
        {
          expected: 'replace_all 为 true 或 old_string 仅命中一次',
          received: JSON.stringify(args.replace_all ?? false),
          path: ['replace_all'],
        },
      ]);
    }

    const updated =
      args.replace_all === true
        ? original.split(args.old_string).join(args.new_string)
        : original.replace(args.old_string, args.new_string);

    const { index } = await getIndexForWorldbook(worldbookName);
    ensureNoConflict(index, normalized);
    const existing = index.exactFiles.get(normalized);
    if (!existing) {
      throw new ToolError('ENTRY_NOT_FOUND', `条目 '${normalized}' 不存在。`);
    }

    await updateWorldbookWith(worldbookName, worldbook =>
      worldbook.map(entry => (entry.uid === existing.uid ? { ...entry, content: updated } : entry)),
    );

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
      replaceAll: args.replace_all === true,
      backup: {
        rollbackMethod: 'editRollback' as const,
        worldbookName,
        filePath: normalized,
        uid: existing.uid,
        originalContent: original,
      },
    };
  });
}
