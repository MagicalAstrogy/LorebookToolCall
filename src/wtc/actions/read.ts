import type { z } from 'zod';
import { ensurePathPermission } from '@/wtc/permission';
import { ToolError, invalidPathDetail } from '@/wtc/result';
import { readArgsSchema } from '@/wtc/schema';
import { normalizeVirtualPath, parseVirtualPath, toCatNumberedText } from '@/wtc/store';
import { resolveDirectoryNode, resolveFileNode } from '@/wtc/node_fs/nodes';

const DEFAULT_READ_CHARACTER_LIMIT = 5000;

function getAutomaticLineLimit(content: string, offset: number) {
  const lines = content.split('\n');
  if (offset >= lines.length) {
    return 0;
  }

  let characterCount = 0;
  let lineCount = 0;
  for (let index = offset; index < lines.length; index += 1) {
    const nextLength = lines[index].length + (lineCount > 0 ? 1 : 0);
    // 至少返回一整行；否则单行超长时 nextOffset 永远无法向后推进。
    if (lineCount > 0 && characterCount + nextLength > DEFAULT_READ_CHARACTER_LIMIT) {
      break;
    }
    characterCount += nextLength;
    lineCount += 1;
    if (characterCount >= DEFAULT_READ_CHARACTER_LIMIT) {
      break;
    }
  }
  return lineCount;
}

export async function readAction(args: z.infer<typeof readArgsSchema>) {
  const normalized = normalizeVirtualPath(args.file_path);
  if (!normalized) {
    throw new ToolError('InputValidationError', 'file_path 必须是绝对路径。', [invalidPathDetail(args.file_path)]);
  }
  await ensurePathPermission(normalized, 'read', { followCharacterWorldbook: true });
  const parsed = parseVirtualPath(normalized);
  // Read 只接受具体文件；集合根、实体根和 Schemas 根目录都按目录错误处理。
  if (
    parsed.rootKind === 'root' ||
    parsed.rootKind === 'lorebooks_root' ||
    parsed.rootKind === 'characters_root' ||
    parsed.rootKind === 'presets_root' ||
    parsed.rootKind === 'schemas_root' ||
    ((parsed.rootKind === 'lorebook' || parsed.rootKind === 'character' || parsed.rootKind === 'preset') && parsed.relativePath === null)
  ) {
    throw new ToolError('InputValidationError', 'Read 只接受具体文件路径，不能读取目录。', [invalidPathDetail(args.file_path)]);
  }
  const node = await resolveFileNode(normalized);
  if (!node) {
    if (await resolveDirectoryNode(normalized)) {
      throw new ToolError('InputValidationError', 'Read 只接受具体文件路径，不能读取目录。', [invalidPathDetail(args.file_path)]);
    }
    throw new ToolError('ENTRY_NOT_FOUND', `条目 '${normalized}' 不存在。`);
  }
  const content = await node.read();

  const offset = args.offset ?? 0;
  const limit = args.limit ?? 0;
  if (offset < 0 || limit < 0) {
    throw new ToolError('InputValidationError', 'offset 和 limit 不能小于 0。', [
      ...(offset < 0 ? [{ expected: '大于等于 0 的整数', received: String(offset), path: ['offset'] }] : []),
      ...(limit < 0 ? [{ expected: '大于等于 0 的整数', received: String(limit), path: ['limit'] }] : []),
    ]);
  }

  // 未指定 limit 时按字符预算自动选择完整行；显式 limit（含 0）仍保持原有行数语义。
  const effectiveLimit = args.limit === undefined ? getAutomaticLineLimit(content, offset) : limit;
  const numbered = toCatNumberedText(content, offset, effectiveLimit);
  const nextOffset = offset + numbered.numLines;
  const hasMore = nextOffset < numbered.totalLines;
  return {
    type: 'text' as const,
    file: {
      filePath: normalized,
      content: numbered.content,
      numLines: numbered.numLines,
      startLine: offset + 1,
      totalLines: numbered.totalLines,
      hasMore,
      nextOffset: hasMore ? nextOffset : null,
    },
  };
}
