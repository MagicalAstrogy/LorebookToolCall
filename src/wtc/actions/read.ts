import type { z } from 'zod';
import { ensureLorebookPermission } from '@/wtc/permission';
import { ToolError } from '@/wtc/result';
import { readArgsSchema } from '@/wtc/schema';
import { requireFileTarget, toCatNumberedText } from '@/wtc/store';
import { readEntryContent } from '@/wtc/actions/shared';

export async function readAction(args: z.infer<typeof readArgsSchema>) {
  const { normalized, worldbookName } = requireFileTarget(args.file_path);
  await ensureLorebookPermission(worldbookName, 'read');
  const content = await readEntryContent(normalized);

  const offset = args.offset ?? 0;
  const limit = args.limit ?? 0;
  if (offset < 0 || limit < 0) {
    throw new ToolError('InputValidationError', 'offset 和 limit 不能小于 0。', [
      ...(offset < 0 ? [{ expected: '大于等于 0 的整数', received: String(offset), path: ['offset'] }] : []),
      ...(limit < 0 ? [{ expected: '大于等于 0 的整数', received: String(limit), path: ['limit'] }] : []),
    ]);
  }
  if (args.limit === undefined) {
    // 未显式限制时做一个保守上限，避免一次性把超长条目全部塞给模型。
    const projected = content.split('\n').slice(offset).join('\n');
    if (projected.length > 5000) {
      throw new ToolError('CONTENT_TOO_LARGE', '未指定 limit 时，本次读取内容超过 5000 字符，建议 limit 300~。');
    }
  }

  const numbered = toCatNumberedText(content, offset, limit);
  return {
    type: 'text' as const,
    file: {
      filePath: normalized,
      content: numbered.content,
      numLines: numbered.numLines,
      startLine: offset + 1,
      totalLines: numbered.totalLines,
    },
  };
}
