import type { z } from 'zod';
import { ensureLorebookPermission } from '@/wtc/permission';
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
  if (!parsed.worldbookName) {
    return {
      basePath: parsed.normalized,
      pattern: '*',
    };
  }

  return {
    basePath: `/${parsed.worldbookName}`,
    pattern: parsed.entryPath ?? '*',
  };
}

export async function globAction(args: z.infer<typeof globArgsSchema>) {
  const { basePath, pattern: rawPattern } = resolveGlobInputs(args);
  if (!basePath) {
    throw new ToolError('InputValidationError', 'path 必须是绝对路径。', [
      invalidPathDetail(String(args.path), 'path'),
    ]);
  }

  let filenames: string[] = [];
  if (basePath === '/') {
    const root = await resolveDirectoryNode('/');
    if (root) {
      for await (const child of root.list()) {
        filenames.push(isDirectoryNode(child) ? `${child.path}/` : child.path);
      }
    }
  } else {
    const { worldbookName } = parseVirtualPath(basePath);
    if (!worldbookName) {
      filenames = [];
    } else {
      await ensureLorebookPermission(worldbookName, 'read');
      const directoryNode = await resolveDirectoryNode(basePath);
      if (directoryNode) {
        for await (const child of walkDirectory(directoryNode)) {
          filenames.push(isDirectoryNode(child) ? `${child.path}/` : child.path);
        }
      }
    }
  }

  // 目录结果会保留尾斜杠，仅用于返回值中的去歧义展示。
  const pattern = globToRegExp(rawPattern);
  const matched = filenames.filter(candidate => {
    const relative = relativeFromBase(basePath, candidate).replace(/\/$/, '');
    return pattern.test(relative);
  });
  const includeDirectoryAliases = basePath !== '/' && rawPattern.includes('**');
  const output = new Set(matched);
  if (includeDirectoryAliases) {
    for (const candidate of matched) {
      if (!candidate.endsWith('/')) {
        continue;
      }
      // 递归 glob 下补一个无尾斜杠别名，兼容常见文件系统 glob 对目录名的返回方式。
      output.add(candidate.slice(0, -1));
    }
  }
  const result = [...output].sort();
  return {
    filenames: result,
    durationMs: 0,
    numFiles: result.length,
    truncated: false,
  };
}
