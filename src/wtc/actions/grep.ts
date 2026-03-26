import type { z } from 'zod';
import { ensurePathPermission } from '@/wtc/permission';
import { ToolError, invalidPathDetail } from '@/wtc/result';
import { grepArgsSchema } from '@/wtc/schema';
import { globToRegExp, inferTypeMatches, parseVirtualPath, relativeFromBase } from '@/wtc/store';
import { compilePattern } from '@/wtc/actions/shared';
import { resolveSearchScope } from '@/wtc/node_fs/nodes';
import { isTextFileNode } from '@/wtc/node_fs/types';
import { walkDirectory } from '@/wtc/node_fs/walk';

export async function grepAction(args: z.infer<typeof grepArgsSchema>) {
  const parsed = parseVirtualPath(args.path);
  const { normalized } = parsed;
  // Grep 只接受某一棵具体子树；集合根目录过宽，容易把整棵虚拟文件树都扫进去。
  if (parsed.rootKind === 'root' || parsed.rootKind === 'lorebooks_root' || parsed.rootKind === 'characters_root' || parsed.rootKind === 'presets_root') {
    throw new ToolError('InputValidationError', 'Grep.path 必须落在某一个确定的 Worldbook、Character、Preset 或 /Schemas 子树内。', [
      invalidPathDetail(args.path, 'path'),
    ]);
  }
  await ensurePathPermission(normalized, 'read', { followCharacterWorldbook: true });
  const outputMode = args.output_mode ?? 'files_with_matches';
  const regex = compilePattern(args.pattern, args['-i'] ?? false, args.multiline ?? false);
  const globMatcher = args.glob ? globToRegExp(args.glob) : null;
  const basePath = normalized;
  const { fileNode, directoryNode } = await resolveSearchScope(basePath);
  const candidates = new Map<string, { filePath: string; content: string }>();

  if (fileNode) {
    candidates.set(fileNode.path, {
      filePath: fileNode.path,
      content: await fileNode.read(),
    });
  }
  if (directoryNode) {
    for await (const node of walkDirectory(directoryNode)) {
      if (!isTextFileNode(node)) {
        continue;
      }
      candidates.set(node.path, {
        filePath: node.path,
        content: await node.read(),
      });
    }
  }

  const matchedFiles = [...candidates.values()].filter(file => {
    const relative = relativeFromBase(basePath, file.filePath);
    if (globMatcher && !globMatcher.test(relative)) {
      return false;
    }
    if (!inferTypeMatches(file.filePath, args.type)) {
      return false;
    }
    return regex.test(file.content);
  });

  const offset = args.offset ?? 0;
  const headLimit = args.head_limit ?? 0;
  const slice = <T>(array: T[]) => (headLimit > 0 ? array.slice(offset, offset + headLimit) : array.slice(offset));

  if (outputMode === 'files_with_matches') {
    const sliced = slice(matchedFiles);
    return {
      mode: 'files_with_matches' as const,
      filenames: sliced.map(file => file.filePath),
      numFiles: matchedFiles.length,
      ...(headLimit > 0 ? { appliedLimit: headLimit } : {}),
    };
  }

  if (outputMode === 'count') {
    const counts = matchedFiles.map(file => {
      const matches = file.content.match(regex);
      return `${file.filePath}:${matches?.length ?? 0}`;
    });
    return {
      mode: 'count' as const,
      numFiles: matchedFiles.length,
      filenames: [],
      content: slice(counts).join('\n'),
    };
  }

  const before = args.context ?? args['-C'] ?? args['-B'] ?? 0;
  const after = args.context ?? args['-C'] ?? args['-A'] ?? 0;
  const blocks: string[] = [];
  for (const file of slice(matchedFiles)) {
    const lines = file.content.split('\n');
    for (let index = 0; index < lines.length; index += 1) {
      if (!regex.test(lines[index])) {
        continue;
      }
      const start = Math.max(0, index - before);
      const end = Math.min(lines.length - 1, index + after);
      for (let cursor = start; cursor <= end; cursor += 1) {
        const separator = cursor === index ? ':' : '-';
        blocks.push(`${file.filePath}${separator}${cursor + 1}${separator}${lines[cursor]}`);
      }
      blocks.push('--');
    }
  }
  if (blocks[blocks.length - 1] === '--') {
    blocks.pop();
  }
  return {
    mode: 'content' as const,
    content: blocks.join('\n'),
  };
}
