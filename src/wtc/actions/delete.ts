import type { z } from 'zod';
import { ensureLorebookPermission } from '@/wtc/permission';
import { ToolError, invalidPathDetail } from '@/wtc/result';
import { deleteArgsSchema } from '@/wtc/schema';
import { ensureNoConflict, requireFileTarget, withWorldbookQueue } from '@/wtc/store';
import { getIndexForWorldbook } from '@/wtc/actions/shared';

export async function deleteAction(args: z.infer<typeof deleteArgsSchema>) {
  const { normalized, worldbookName } = requireFileTarget(args.file_path);
  await ensureLorebookPermission(worldbookName, 'delete');

  return withWorldbookQueue(worldbookName, async () => {
    const { index } = await getIndexForWorldbook(worldbookName);
    ensureNoConflict(index, normalized);
    const existing = index.exactFiles.get(normalized);
    if (!existing) {
      if (index.directories.includes(`${normalized}/`)) {
        throw new ToolError('InputValidationError', 'Delete 只接受条目路径，不能删除虚拟目录。', [
          invalidPathDetail(args.file_path),
        ]);
      }
      throw new ToolError('ENTRY_NOT_FOUND', `条目 '${normalized}' 不存在。`);
    }
    await deleteWorldbookEntries(worldbookName, entry => entry.uid === existing.uid);
    return {
      filePath: normalized,
      deleted: true,
    };
  });
}

