import type { z } from 'zod';
import { ensureLorebookPermission } from '@/wtc/permission';
import { ToolError } from '@/wtc/result';
import { getAttributeArgsSchema } from '@/wtc/schema';
import { ensureNoConflict, requireFileTarget } from '@/wtc/store';
import { getIndexForWorldbook } from '@/wtc/actions/shared';

export async function getAttributeAction(args: z.infer<typeof getAttributeArgsSchema>) {
  // Attribute 只存在于条目节点上，不支持目录级查询。
  const { normalized, worldbookName } = requireFileTarget(args.file_path);
  await ensureLorebookPermission(worldbookName, 'read');
  const { index } = await getIndexForWorldbook(worldbookName);
  ensureNoConflict(index, normalized);
  const existing = index.exactFiles.get(normalized);
  if (!existing) {
    throw new ToolError('ENTRY_NOT_FOUND', `条目 '${normalized}' 不存在。`);
  }
  const worldbook = await getWorldbook(worldbookName);
  const attributes = worldbook.find(entry => entry.uid === existing.uid);
  if (!attributes) {
    throw new ToolError('tool_use_error', '无法从高层世界书接口定位条目属性。');
  }
  return {
    filePath: normalized,
    attributes,
  };
}
