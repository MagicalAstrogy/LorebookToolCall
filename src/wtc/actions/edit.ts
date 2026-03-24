import type { z } from 'zod';
import { ensurePathPermission } from '@/wtc/permission';
import { ToolError, invalidPathDetail } from '@/wtc/result';
import { editArgsSchema } from '@/wtc/schema';
import type { StructuredPatch } from '@/wtc/store';
import { createStructuredPatch, normalizeVirtualPath } from '@/wtc/store';
import { resolveDirectoryNode, resolveFileNode } from '@/wtc/node_fs/nodes';

const MAX_INLINE_ORIGINAL_FILE_LENGTH = 5000;

export type EditBackup = {
  // Edit 的回滚始终基于编辑前的完整原文恢复 content。
  rollbackMethod: 'editRollback';
  filePath: string;
  originalContent: string;
};

type EditActionResult = {
  filePath: string;
  oldString: string;
  newString: string;
  originalFile: string | null;
  originalFileNotice?: string;
  structuredPatch: StructuredPatch[];
  userModified: boolean;
  replaceAll: boolean;
  warnings?: string[];
  backup: EditBackup;
};

/**
 * 回滚方式：
 * 将本次 `editAction()` 返回的 `backup` 原样传给 `editRollback()`，
 * 它会直接把条目内容恢复到编辑前的完整文本。
 */
export async function editRollback(backup: EditBackup | undefined) {
  if (!backup) {
    throw new ToolError('InputValidationError', '当前编辑结果不包含可回滚信息。');
  }
  await ensurePathPermission(backup.filePath, 'write', { followCharacterWorldbook: true });
  const node = await resolveFileNode(backup.filePath);
  if (!node) {
    throw new ToolError('ENTRY_NOT_FOUND', `条目 '${backup.filePath}' 不存在，无法回滚编辑操作。`);
  }
  await node.write(backup.originalContent);
  return {
    filePath: backup.filePath,
    rolledBack: true,
  };
}

export async function editAction(args: z.infer<typeof editArgsSchema>): Promise<EditActionResult> {
  const normalized = normalizeVirtualPath(args.file_path);
  if (!normalized) {
    throw new ToolError('InputValidationError', 'file_path 必须是绝对路径。', [invalidPathDetail(args.file_path)]);
  }
  await ensurePathPermission(normalized, 'write', { followCharacterWorldbook: true });

  const node = await resolveFileNode(normalized);
  if (!node) {
    if (await resolveDirectoryNode(normalized)) {
      throw new ToolError('InputValidationError', 'Edit 只接受具体文件路径，不能编辑目录。', [invalidPathDetail(args.file_path)]);
    }
    throw new ToolError('ENTRY_NOT_FOUND', `条目 '${normalized}' 不存在。`);
  }

  const runEdit = async () => {
    const { originalContent: original, updatedContent: updated, replaceAll } = await node.edit({
      oldString: args.old_string,
      newString: args.new_string,
      replaceAll: args.replace_all,
    });
    const originalFileTooLarge = original.length > MAX_INLINE_ORIGINAL_FILE_LENGTH;
    const warnings = 'takeLastWarnings' in node && typeof node.takeLastWarnings === 'function' ? node.takeLastWarnings() : [];
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
      ...(warnings.length > 0 ? { warnings } : {}),
      originalContent: original,
    };
  };

  const result = await runEdit();
  const { originalContent, ...rest } = result;
  return {
    ...rest,
    backup: {
      rollbackMethod: 'editRollback' as const,
      filePath: normalized,
      originalContent,
    },
  };
}
