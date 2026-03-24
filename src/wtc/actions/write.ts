import type { z } from 'zod';
import { ensurePathPermission } from '@/wtc/permission';
import { ToolError, invalidPathDetail } from '@/wtc/result';
import { writeArgsSchema } from '@/wtc/schema';
import type { StructuredPatch } from '@/wtc/store';
import { createStructuredPatch, normalizeVirtualPath } from '@/wtc/store';
import { resolveDirectoryNode, resolveWritableFileNode } from '@/wtc/node_fs/nodes';
import { resolveCharacterWriteCreateRollbackContext } from '@/wtc/fs_bind';
import { restoreCharacterFirstMessagesLength } from '@/wtc/fs_bind';
import { isDeletableNode } from '@/wtc/node_fs/types';

export type WriteBackup =
  | {
      rollbackMethod: 'writeRollback';
      mode: 'create';
      filePath: string;
      strategy: 'delete';
    }
  | {
      rollbackMethod: 'writeRollback';
      filePath: string;
      mode: 'create';
      strategy: 'restore_character_first_messages_length';
      characterName: string;
      previousLength: number;
    }
  | {
      rollbackMethod: 'writeRollback';
      mode: 'update';
      filePath: string;
      originalContent: string;
    };

type WriteActionResult = {
  type: 'create' | 'update';
  filePath: string;
  content: string;
  structuredPatch: StructuredPatch[];
  originalFile: string | null;
  warnings?: string[];
  backup?: WriteBackup;
};

/**
 * 回滚方式：
 * 将本次 `writeAction()` 返回的 `backup` 原样传给 `writeRollback()`，
 * `create` 会删除刚创建的条目，`update` 会把内容恢复到写入前。
 */
export async function writeRollback(backup: WriteBackup | undefined) {
  if (!backup) {
    throw new ToolError('InputValidationError', '当前写入结果不包含可回滚信息。');
  }
  if (backup.mode === 'create') {
    if (backup.strategy === 'restore_character_first_messages_length') {
      await ensurePathPermission(backup.filePath, 'write', { followCharacterWorldbook: true });
      await restoreCharacterFirstMessagesLength(backup.characterName, backup.previousLength);
      return {
        filePath: backup.filePath,
        rolledBack: true,
      };
    }

    await ensurePathPermission(backup.filePath, 'delete', { followCharacterWorldbook: true });
    const file = await resolveWritableFileNode(backup.filePath);
    if (!file || !('path' in file)) {
      throw new ToolError('ENTRY_NOT_FOUND', `条目 '${backup.filePath}' 不存在，无法回滚创建操作。`);
    }
    const existing = await resolveWritableFileNode(backup.filePath);
    if (!existing || !('exists' in existing) || existing.exists !== true) {
      throw new ToolError('ENTRY_NOT_FOUND', `条目 '${backup.filePath}' 不存在，无法回滚创建操作。`);
    }
    if (!isDeletableNode(existing)) {
      throw new ToolError('InputValidationError', '当前写入结果不支持回滚删除。');
    }
    await existing.delete();
    return {
      filePath: backup.filePath,
      rolledBack: true,
    };
  }

  await ensurePathPermission(backup.filePath, 'write', { followCharacterWorldbook: true });
  const writable = await resolveWritableFileNode(backup.filePath);
  if (!writable) {
    throw new ToolError('ENTRY_NOT_FOUND', `条目 '${backup.filePath}' 不存在，无法回滚写入操作。`);
  }
  await writable.write(backup.originalContent);
  return {
    filePath: backup.filePath,
    rolledBack: true,
  };
}

export async function writeAction(args: z.infer<typeof writeArgsSchema>): Promise<WriteActionResult> {
  const normalized = normalizeVirtualPath(args.file_path);
  if (!normalized) {
    throw new ToolError('InputValidationError', 'file_path 必须是绝对路径。', [invalidPathDetail(args.file_path)]);
  }
  await ensurePathPermission(normalized, 'write', { followCharacterWorldbook: true });

  const node = await resolveWritableFileNode(normalized);
  if (!node) {
    if (await resolveDirectoryNode(normalized)) {
      throw new ToolError('InputValidationError', 'Write 只接受具体文件路径，不能写入目录。', [invalidPathDetail(args.file_path)]);
    }
    throw new ToolError('InputValidationError', '当前路径不可写入。', [invalidPathDetail(args.file_path)]);
  }
  const originalContent = node.exists ? await node.read() : null;
  const createRollbackContext = originalContent === null ? await resolveCharacterWriteCreateRollbackContext(normalized) : null;
  const writeNode = async () => {
    await node.write(args.content);
    return 'takeLastWarnings' in node && typeof node.takeLastWarnings === 'function' ? node.takeLastWarnings() : [];
  };

  const finalize = async (warnings: string[]) => ({
    type: node.exists ? ('update' as const) : ('create' as const),
    filePath: normalized,
    content: args.content,
    structuredPatch: originalContent === null ? [] : createStructuredPatch(originalContent, args.content),
    originalFile: originalContent,
    ...(warnings.length > 0 ? { warnings } : {}),
  });

  const warnings = await writeNode();
  const base = await finalize(warnings);
  if (originalContent === null) {
    if (createRollbackContext) {
      return {
        ...base,
        backup: {
          rollbackMethod: 'writeRollback' as const,
          mode: 'create' as const,
          filePath: normalized,
          strategy: 'restore_character_first_messages_length' as const,
          characterName: createRollbackContext.characterName,
          previousLength: createRollbackContext.previousLength,
        },
      };
    }
    return {
      ...base,
      backup: {
        rollbackMethod: 'writeRollback' as const,
        mode: 'create' as const,
        filePath: normalized,
        strategy: 'delete' as const,
      },
    };
  }
  return {
    ...base,
    backup: {
      rollbackMethod: 'writeRollback' as const,
      mode: 'update' as const,
      filePath: normalized,
      originalContent,
    },
  };
}
