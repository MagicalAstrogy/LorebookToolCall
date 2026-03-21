import type { z } from 'zod';
import { ensureLorebookPermission } from '@/wtc/permission';
import { ToolError, invalidPathDetail } from '@/wtc/result';
import { globArgsSchema } from '@/wtc/schema';
import {
  globToRegExp,
  listCandidatesUnder,
  normalizeVirtualPath,
  parseVirtualPath,
  relativeFromBase,
} from '@/wtc/store';
import { getIndexForWorldbook } from '@/wtc/actions/shared';

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

  let filenames: string[];
  if (basePath === '/') {
    // 根目录下只列世界书目录，不需要先读取具体某一本世界书。
    filenames = listCandidatesUnder({ files: [], directories: [], exactFiles: new Map(), conflicts: new Set() }, '/');
  } else {
    const { worldbookName } = parseVirtualPath(basePath);
    if (!worldbookName) {
      filenames = [];
    } else {
      await ensureLorebookPermission(worldbookName, 'read');
      const { index } = await getIndexForWorldbook(worldbookName);
      filenames = listCandidatesUnder(index, basePath);
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
