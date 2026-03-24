import type { z } from 'zod';
import { ensurePathPermission } from '@/wtc/permission';
import { ToolError, invalidPathDetail } from '@/wtc/result';
import { encodeWorldbookEntryPatchSpecialValues, getAttributeArgsSchema } from '@/wtc/schema';
import { normalizeVirtualPath } from '@/wtc/store';
import { resolveFileNode } from '@/wtc/node_fs/nodes';
import { isAttributeNode } from '@/wtc/node_fs/types';

type ReturnedAttributes = Record<string, unknown> & { comment?: never; content?: never };

function sanitizeReturnedAttributes(attributes: WorldbookEntry): ReturnedAttributes {
  const { content: _content, ...rest } = attributes as WorldbookEntry & { comment?: string };
  delete (rest as { comment?: string }).comment;
  return encodeWorldbookEntryPatchSpecialValues(rest as Record<string, unknown>) as ReturnedAttributes;
}

export async function getAttributeAction(args: z.infer<typeof getAttributeArgsSchema>) {
  // Attribute 只存在于条目节点上，不支持目录级查询。
  const normalized = normalizeVirtualPath(args.file_path);
  if (!normalized) {
    throw new ToolError('InputValidationError', 'file_path 必须是绝对路径。', [invalidPathDetail(args.file_path)]);
  }
  await ensurePathPermission(normalized, 'read', { followCharacterWorldbook: true });
  const node = await resolveFileNode(normalized);
  if (!node) {
    throw new ToolError('ENTRY_NOT_FOUND', `条目 '${normalized}' 不存在。`);
  }
  if (!isAttributeNode(node)) {
    throw new ToolError('InputValidationError', '当前路径不支持属性读取。', [invalidPathDetail(args.file_path)]);
  }
  const attributes = await node.getattr();
  return {
    filePath: normalized,
    attributes: sanitizeReturnedAttributes(attributes as WorldbookEntry),
  };
}
