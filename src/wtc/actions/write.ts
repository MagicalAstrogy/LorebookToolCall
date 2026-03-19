import type { z } from 'zod';
import { ensureLorebookPermission } from '@/wtc/permission';
import { ToolError } from '@/wtc/result';
import { writeArgsSchema } from '@/wtc/schema';
import {
  basenameFromEntryPath,
  createStructuredPatch,
  ensureNoConflict,
  loadRawWorldbook,
  requireFileTarget,
  saveRawWorldbook,
  withWorldbookQueue,
} from '@/wtc/store';
import { getIndexForWorldbook, readEntryContent } from '@/wtc/actions/shared';

export async function writeAction(args: z.infer<typeof writeArgsSchema>) {
  const { normalized, worldbookName, entryPath } = requireFileTarget(args.file_path);
  await ensureLorebookPermission(worldbookName, 'write');

  return withWorldbookQueue(worldbookName, async () => {
    const { index } = await getIndexForWorldbook(worldbookName);
    ensureNoConflict(index, normalized);
    const existing = index.exactFiles.get(normalized);
    if (existing) {
      const original = await readEntryContent(normalized);
      await updateWorldbookWith(worldbookName, worldbook =>
        worldbook.map(entry => (entry.uid === existing.uid ? { ...entry, content: args.content } : entry)),
      );
      return {
        type: 'update' as const,
        filePath: normalized,
        content: args.content,
        structuredPatch: createStructuredPatch(original, args.content),
        originalFile: original,
      };
    }

    const { new_entries } = await createWorldbookEntries(worldbookName, [
      {
        name: basenameFromEntryPath(entryPath),
        content: args.content,
      },
    ]);
    const created = new_entries[0];
    const reloaded = await loadRawWorldbook(worldbookName);
    const raw = reloaded.entries.find(entry => entry.id === created.uid);
    if (!raw) {
      throw new ToolError('tool_use_error', '创建条目后无法在世界书中定位新条目。');
    }
    raw.comment = entryPath;
    raw.content = args.content;
    await saveRawWorldbook(worldbookName, reloaded);
    return {
      type: 'create' as const,
      filePath: normalized,
      content: args.content,
      structuredPatch: [],
      originalFile: null,
    };
  });
}

