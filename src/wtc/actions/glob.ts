import type { z } from 'zod';
import { ensureLorebookPermission } from '@/wtc/permission';
import { ToolError, invalidPathDetail } from '@/wtc/result';
import { globArgsSchema } from '@/wtc/schema';
import { globToRegExp, listCandidatesUnder, normalizeVirtualPath, parseVirtualPath, relativeFromBase } from '@/wtc/store';
import { getIndexForWorldbook } from '@/wtc/actions/shared';

export async function globAction(args: z.infer<typeof globArgsSchema>) {
  const basePath = normalizeVirtualPath(args.path ?? '/');
  if (!basePath) {
    throw new ToolError('InputValidationError', 'path 必须是绝对路径。', [invalidPathDetail(String(args.path), 'path')]);
  }

  let filenames: string[];
  if (basePath === '/') {
    filenames = listCandidatesUnder(
      { files: [], directories: [], exactFiles: new Map(), conflicts: new Set() },
      '/',
    );
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

  const pattern = globToRegExp(args.pattern);
  const matched = filenames.filter(candidate => {
    const relative = relativeFromBase(basePath, candidate).replace(/\/$/, '');
    return pattern.test(relative);
  });
  return {
    filenames: matched,
    durationMs: 0,
    numFiles: matched.length,
    truncated: false,
  };
}
