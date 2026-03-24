import type { z } from 'zod';
import { ensurePathPermission } from '@/wtc/permission';
import { ToolError, invalidPathDetail } from '@/wtc/result';
import { globArgsSchema } from '@/wtc/schema';
import { globToRegExp, normalizeVirtualPath, relativeFromBase } from '@/wtc/store';
import { resolveDirectoryNode } from '@/wtc/node_fs/nodes';
import { isDirectoryNode } from '@/wtc/node_fs/types';
import { walkDirectory } from '@/wtc/node_fs/walk';

function splitAbsoluteGlobPattern(pattern: string) {
  const normalized = normalizeVirtualPath(pattern);
  if (!normalized) {
    return {
      basePath: null,
      pattern: '*',
    };
  }
  if (normalized === '/') {
    return {
      basePath: normalized,
      pattern: '*',
    };
  }
  const trimmed = normalized.replace(/\/+$/, '');
  const lastSlashIndex = trimmed.lastIndexOf('/');
  if (lastSlashIndex <= 0) {
    return {
      basePath: '/',
      pattern: trimmed.slice(1) || '*',
    };
  }
  return {
    basePath: trimmed.slice(0, lastSlashIndex),
    pattern: trimmed.slice(lastSlashIndex + 1) || '*',
  };
}

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

  return splitAbsoluteGlobPattern(args.pattern);
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
