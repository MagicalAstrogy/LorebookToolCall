import type { z } from 'zod';
import { ensurePathPermission } from '@/wtc/permission';
import { ToolError, invalidPathDetail } from '@/wtc/result';
import { deleteArgsSchema } from '@/wtc/schema';
import { normalizeVirtualPath } from '@/wtc/store';
import { resolveDirectoryNode, resolveFileNode, resolveWritableFileNode } from '@/wtc/node_fs/nodes';
import { isAttributeNode, isDeleteBackupCapableNode } from '@/wtc/node_fs/types';
import type { DeleteBackup } from '@/wtc/node_fs/types';
import { restoreDeletedCharacterFirstMessage } from '@/wtc/fs_bind';

export async function deleteRollback(backup: DeleteBackup | undefined) {
  if (!backup) {
    throw new ToolError('InputValidationError', '当前删除结果不包含可回滚信息。');
  }
  await ensurePathPermission(backup.filePath, 'write', { followCharacterWorldbook: true });

  if (backup.strategy === 'insert_character_first_message') {
    await restoreDeletedCharacterFirstMessage(backup.characterName, backup.index, backup.content);
    return {
      filePath: backup.filePath,
      rolledBack: true,
    };
  }

  const writable = await resolveWritableFileNode(backup.filePath);
  if (!writable) {
    throw new ToolError('ENTRY_NOT_FOUND', `条目 '${backup.filePath}' 不存在，无法回滚删除操作。`);
  }
  await writable.write(backup.content);
  if (backup.attributes) {
    const restored = await resolveFileNode(backup.filePath);
    if (!restored || !isAttributeNode(restored)) {
      throw new ToolError('tool_use_error', '回滚删除操作后无法恢复条目属性。');
    }
    await restored.setattr(backup.attributes);
  }
  return {
    filePath: backup.filePath,
    rolledBack: true,
  };
}

export async function deleteAction(args: z.infer<typeof deleteArgsSchema>) {
  const normalized = normalizeVirtualPath(args.file_path);
  if (!normalized) {
    throw new ToolError('InputValidationError', 'file_path 必须是绝对路径。', [invalidPathDetail(args.file_path)]);
  }
  await ensurePathPermission(normalized, 'delete', { followCharacterWorldbook: true });

  const node = await resolveFileNode(normalized);
  if (!node) {
    if (await resolveDirectoryNode(normalized)) {
      throw new ToolError('InputValidationError', 'Delete 只接受文件路径，不能删除目录。', [
        invalidPathDetail(args.file_path),
      ]);
    }
    throw new ToolError('ENTRY_NOT_FOUND', `条目 '${normalized}' 不存在。`);
  }
  if (!('delete' in node) || typeof node.delete !== 'function') {
    throw new ToolError('InputValidationError', 'Delete 不支持此文件路径。', [invalidPathDetail(args.file_path)]);
  }
  const backup = isDeleteBackupCapableNode(node) ? await node.createDeleteBackup() : undefined;
  await node.delete();
  return {
    filePath: normalized,
    deleted: true,
    ...(backup ? { backup } : {}),
  };
}
