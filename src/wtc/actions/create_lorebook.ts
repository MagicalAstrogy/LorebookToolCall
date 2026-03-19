import type { z } from 'zod';
import { ensureLorebookPermission } from '@/wtc/permission';
import { ToolError } from '@/wtc/result';
import { createLorebookArgsSchema } from '@/wtc/schema';

export async function createLorebookAction(args: z.infer<typeof createLorebookArgsSchema>) {
  if (args.lorebook_name.includes('/')) {
    throw new ToolError('InputValidationError', 'lorebook_name 不能包含 /。', [
      {
        expected: '不包含 / 的世界书名称',
        received: args.lorebook_name,
        path: ['lorebook_name'],
      },
    ]);
  }
  await ensureLorebookPermission(args.lorebook_name, 'write');
  const created = await createWorldbook(args.lorebook_name, []);
  if (!created) {
    throw new ToolError('WORLD_ALREADY_EXISTS', `世界书 '${args.lorebook_name}' 已存在。`);
  }
  return {
    lorebookName: args.lorebook_name,
    created: true,
  };
}

