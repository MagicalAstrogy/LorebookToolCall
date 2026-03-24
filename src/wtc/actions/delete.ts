import type { z } from 'zod';
import { ensureLorebookPermission } from '@/wtc/permission';
import { ToolError, invalidPathDetail } from '@/wtc/result';
import { deleteArgsSchema } from '@/wtc/schema';
import { requireFileTarget, withWorldbookQueue } from '@/wtc/store';
import { resolveDirectoryNode, resolveFileNode } from '@/wtc/node_fs/nodes';

export async function deleteAction(args: z.infer<typeof deleteArgsSchema>) {
  const { normalized, worldbookName } = requireFileTarget(args.file_path);
  await ensureLorebookPermission(worldbookName, 'delete');

  return withWorldbookQueue(worldbookName, async () => {
    const node = await resolveFileNode(normalized);
    if (!node) {
      // 目录类路径与文件类路径同名时，Delete 仍只按“条目文件”语义处理。
      if (await resolveDirectoryNode(normalized)) {
        throw new ToolError('InputValidationError', 'Delete 只接受条目路径，不能删除虚拟目录。', [
          invalidPathDetail(args.file_path),
        ]);
      }
      throw new ToolError('ENTRY_NOT_FOUND', `条目 '${normalized}' 不存在。`);
    }
    await node.delete();
    return {
      filePath: normalized,
      deleted: true,
    };
  });
}
