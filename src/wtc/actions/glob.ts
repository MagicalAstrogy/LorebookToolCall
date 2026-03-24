import type { z } from 'zod';
import { ensurePathPermission } from '@/wtc/permission';
import { ToolError, invalidPathDetail } from '@/wtc/result';
import { globArgsSchema } from '@/wtc/schema';
import { globToRegExp, normalizeVirtualPath, parseVirtualPath, relativeFromBase } from '@/wtc/store';
import { resolveDirectoryNode } from '@/wtc/node_fs/nodes';
import { isDirectoryNode } from '@/wtc/node_fs/types';
import { walkDirectory } from '@/wtc/node_fs/walk';

function resolveGlobInputs(args: z.infer<typeof globArgsSchema>) {
  if (args.path) {
    return {
      basePath: normalizeVirtualPath(args.path),
      pattern: args.pattern,
    };
  }

  if (!args.pattern.startsWith('/')) {
    return {
      basePath: normalizeVirtualPath('/'),
      pattern: args.pattern,
    };
  }

  const parsed = parseVirtualPath(args.pattern);
  if (parsed.rootKind !== 'lorebook') {
    return {
      basePath: parsed.normalized,
      pattern: '*',
    };
  }

  return {
    basePath: `/Worldbooks/${parsed.entityName}`,
    pattern: parsed.relativePath ?? '*',
  };
}

export async function globAction(args: z.infer<typeof globArgsSchema>) {
  const { basePath, pattern: rawPattern } = resolveGlobInputs(args);
  if (!basePath) {
    throw new ToolError('InputValidationError', 'path 必须是绝对路径。', [
      invalidPathDetail(String(args.path), 'path'),
    ]);
  }

  await ensurePathPermission(basePath, 'read', { followCharacterWorldbook: true });
  const directoryNode = await resolveDirectoryNode(basePath);
  const filenames: string[] = [];
  if (directoryNode) {
    for await (const child of walkDirectory(directoryNode)) {
      filenames.push(isDirectoryNode(child) ? `${child.path}/` : child.path);
    }
  }

  // 目录结果会保留尾斜杠，仅用于返回值中的去歧义展示。
  const pattern = globToRegExp(rawPattern);
  const matched = filenames.filter(candidate => {
    const relative = relativeFromBase(basePath, candidate).replace(/\/$/, '');
    return pattern.test(relative);
  });
  const result = [...new Set(matched)].sort();
  return {
    filenames: result,
    durationMs: 0,
    numFiles: result.length,
    truncated: false,
  };
}
