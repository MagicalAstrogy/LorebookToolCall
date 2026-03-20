import type { z } from 'zod';
import { ensureLorebookPermission } from '@/wtc/permission';
import { ToolError } from '@/wtc/result';
import { setAttributeArgsSchema } from '@/wtc/schema';
import { applyWorldbookPatch, ensureNoConflict, requireFileTarget, withWorldbookQueue } from '@/wtc/store';
import { getIndexForWorldbook } from '@/wtc/actions/shared';

export async function setAttributeAction(args: z.infer<typeof setAttributeArgsSchema>) {
  const { normalized, worldbookName } = requireFileTarget(args.file_path);
  await ensureLorebookPermission(worldbookName, 'write');

  return withWorldbookQueue(worldbookName, async () => {
    const { index } = await getIndexForWorldbook(worldbookName);
    ensureNoConflict(index, normalized);
    const existing = index.exactFiles.get(normalized);
    if (!existing) {
      throw new ToolError('ENTRY_NOT_FOUND', `条目 '${normalized}' 不存在。`);
    }

    let updatedEntry: WorldbookEntry | undefined;
    // 直接在高层条目对象上应用 patch，保持字段语义与 WorldbookEntry 一致。
    await updateWorldbookWith(worldbookName, worldbook =>
      worldbook.map(entry => {
        if (entry.uid !== existing.uid) {
          return entry;
        }
        updatedEntry = applyWorldbookPatch(entry, args.attributes);
        return updatedEntry;
      }),
    );

    if (!updatedEntry) {
      throw new ToolError('tool_use_error', '更新条目属性失败。');
    }

    return {
      filePath: normalized,
      attributes: updatedEntry,
    };
  });
}
