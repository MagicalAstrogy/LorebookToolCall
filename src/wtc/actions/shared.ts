import { ToolError } from '@/wtc/result';
import { buildPathIndex, ensureNoConflict, loadRawWorldbook, requireLorebookFileTarget } from '@/wtc/store';

export async function getIndexForWorldbook(worldbookName: string) {
  // 先拉原始世界书，再建立一次只面向工具层的虚拟文件索引。
  const book = await loadRawWorldbook(worldbookName);
  return { book, index: buildPathIndex(worldbookName, book) };
}

export async function readEntryContent(filePath: string) {
  const { worldbookName } = requireLorebookFileTarget(filePath);
  const { index } = await getIndexForWorldbook(worldbookName);
  ensureNoConflict(index, filePath);
  const found = index.exactFiles.get(filePath);
  if (!found) {
    throw new ToolError('ENTRY_NOT_FOUND', `条目 '${filePath}' 不存在。`);
  }
  return found.raw.content;
}

export function compilePattern(pattern: string, ignoreCase: boolean, multiline: boolean) {
  try {
    return new RegExp(pattern, `${ignoreCase ? 'i' : ''}${multiline ? 'ms' : 'm'}`);
  } catch {
    throw new ToolError('InputValidationError', 'pattern 不是合法的正则表达式。', [
      {
        expected: '合法的正则表达式',
        received: pattern,
        path: ['pattern'],
      },
    ]);
  }
}
