import type { z } from 'zod';
import { ensureLorebookPermission } from '@/wtc/permission';
import { ToolError } from '@/wtc/result';
import { encodeWorldbookEntryPatchSpecialValues, getAttributeArgsSchema } from '@/wtc/schema';
import { requireFileTarget } from '@/wtc/store';
import { resolveFileNode } from '@/wtc/node_fs/nodes';

type ReturnedAttributes = Record<string, unknown> & { comment?: never; content?: never };

function sanitizeReturnedAttributes(attributes: WorldbookEntry): ReturnedAttributes {
  const { content: _content, ...rest } = attributes as WorldbookEntry & { comment?: string };
  delete (rest as { comment?: string }).comment;
  return encodeWorldbookEntryPatchSpecialValues(rest as Record<string, unknown>) as ReturnedAttributes;
}

export async function getAttributeAction(args: z.infer<typeof getAttributeArgsSchema>) {
  // Attribute 只存在于条目节点上，不支持目录级查询。
  const { normalized, worldbookName } = requireFileTarget(args.file_path);
  await ensureLorebookPermission(worldbookName, 'read');
  const node = await resolveFileNode(normalized);
  if (!node) {
    throw new ToolError('ENTRY_NOT_FOUND', `条目 '${normalized}' 不存在。`);
  }
  const attributes = await node.getattr();
  return {
    filePath: normalized,
    attributes: sanitizeReturnedAttributes(attributes as WorldbookEntry),
  };
}
