import type { z } from 'zod';
import { ensurePathPermission } from '@/wtc/permission';
import { ToolError, invalidPathDetail } from '@/wtc/result';
import { decodeWorldbookEntryPatchSpecialValues, encodeWorldbookEntryPatchSpecialValues, setAttributeArgsSchema } from '@/wtc/schema';
import { normalizeVirtualPath, withWorldbookQueue } from '@/wtc/store';
import { resolveFileNode } from '@/wtc/node_fs/nodes';
import { isAttributeNode } from '@/wtc/node_fs/types';
import { resolveWorldbookBackedFileTarget } from '@/wtc/fs_bind';
type ReturnedAttributes = Record<string, unknown> & { comment?: never; content?: never };
type DeleteMarker = { __delete: true };
type RollbackPatch = Record<string, unknown>;

function sanitizeReturnedAttributes(attributes: WorldbookEntry): ReturnedAttributes {
  const { content: _content, ...rest } = attributes as WorldbookEntry & { comment?: string };
  delete (rest as { comment?: string }).comment;
  return encodeWorldbookEntryPatchSpecialValues(rest as Record<string, unknown>) as ReturnedAttributes;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function createDeleteMarker(): DeleteMarker {
  return { __delete: true };
}

function isDeleteMarker(value: unknown): value is DeleteMarker {
  return isPlainObject(value) && value.__delete === true;
}

function buildRollbackValue(patchValue: unknown, previousValue: unknown): unknown {
  if (isPlainObject(patchValue)) {
    // 对象字段继续递归，只记录这次 patch 触达的子路径。
    const rollbackObject: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(patchValue)) {
      const previousChild = isPlainObject(previousValue) ? previousValue[key] : undefined;
      rollbackObject[key] = buildRollbackValue(value, previousChild);
    }
    return rollbackObject;
  }

  return previousValue === undefined ? createDeleteMarker() : structuredClone(previousValue);
}

function buildRollbackPatchFromPrevious(patch: Record<string, unknown>, previousEntry: WorldbookEntry): RollbackPatch {
  // rollbackPatch 只保存本次 patch 命中的旧值，保证回滚仍是 lossy 语义。
  const rollbackPatch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    rollbackPatch[key] = buildRollbackValue(value, (previousEntry as Record<string, unknown>)[key]);
  }
  return rollbackPatch;
}

function applyRollbackValue(currentValue: unknown, rollbackValue: unknown): unknown {
  if (isDeleteMarker(rollbackValue)) {
    return createDeleteMarker();
  }
  if (isPlainObject(rollbackValue)) {
    // 回滚时以当前值为底，只覆盖本次需要恢复的字段，保留其他后续修改。
    const base = isPlainObject(currentValue) ? { ...currentValue } : {};
    for (const [key, childRollback] of Object.entries(rollbackValue)) {
      const restoredChild = applyRollbackValue((base as Record<string, unknown>)[key], childRollback);
      if (isDeleteMarker(restoredChild)) {
        delete (base as Record<string, unknown>)[key];
      } else {
        (base as Record<string, unknown>)[key] = restoredChild;
      }
    }
    return base;
  }
  return structuredClone(rollbackValue);
}

function applyLossyRollback(entry: WorldbookEntry, rollbackPatch: RollbackPatch): WorldbookEntry {
  // 这里不直接覆盖整条 entry，而是按 rollbackPatch 做字段级恢复。
  const restored = structuredClone(entry) as WorldbookEntry & Record<string, unknown>;
  for (const [key, rollbackValue] of Object.entries(rollbackPatch)) {
    const restoredValue = applyRollbackValue(restored[key], rollbackValue);
    if (isDeleteMarker(restoredValue)) {
      delete restored[key];
    } else {
      restored[key] = restoredValue;
    }
  }
  return restored;
}

export type SetAttributeBackup = {
  rollbackMethod: 'setAttributeRollback';
  worldbookName: string;
  filePath: string;
  uid: number;
  rollbackPatch: RollbackPatch;
};

/**
 * 回滚方式：
 * 将本次 `setAttributeAction()` 返回的 `backup` 原样传给 `setAttributeRollback()`，
 * 它会按 lossy patch 语义，仅恢复本次改动过的字段，不覆盖其他后续改动。
 */
export async function setAttributeRollback(backup: SetAttributeBackup) {
  await ensurePathPermission(backup.filePath, 'write', { followCharacterWorldbook: true });
  return withWorldbookQueue(backup.worldbookName, async () => {
    let restoredEntry: WorldbookEntry | undefined;
    await updateWorldbookWith(backup.worldbookName, worldbook => {
      let found = false;
      const restored = worldbook.map(entry => {
        if (entry.uid !== backup.uid) {
          return entry;
        }
        found = true;
        restoredEntry = applyLossyRollback(entry, backup.rollbackPatch);
        return restoredEntry;
      });
      if (!found) {
        throw new ToolError('ENTRY_NOT_FOUND', `条目 '${backup.filePath}' 不存在，无法回滚属性修改。`);
      }
      return restored;
    });

    if (!restoredEntry) {
      throw new ToolError('tool_use_error', '回滚属性修改失败。');
    }

    return {
      filePath: backup.filePath,
      rolledBack: true,
      attributes: sanitizeReturnedAttributes(restoredEntry),
    };
  });
}

export async function setAttributeAction(args: z.infer<typeof setAttributeArgsSchema>) {
  const normalized = normalizeVirtualPath(args.file_path);
  if (!normalized) {
    throw new ToolError('InputValidationError', 'file_path 必须是绝对路径。', [invalidPathDetail(args.file_path)]);
  }
  const normalizedAttributes = decodeWorldbookEntryPatchSpecialValues(args.attributes);
  await ensurePathPermission(normalized, 'write', { followCharacterWorldbook: true });

  const node = await resolveFileNode(normalized);
  if (!node) {
    throw new ToolError('ENTRY_NOT_FOUND', `条目 '${normalized}' 不存在。`);
  }
  if (!isAttributeNode(node)) {
    throw new ToolError('InputValidationError', '当前路径不支持属性修改。', [invalidPathDetail(args.file_path)]);
  }
  const worldbookTarget = await resolveWorldbookBackedFileTarget(normalized);
  if (!worldbookTarget) {
    throw new ToolError('InputValidationError', '当前路径不支持属性修改。', [invalidPathDetail(args.file_path)]);
  }
  const worldbookName = worldbookTarget.worldbookName;
  return withWorldbookQueue(worldbookName, async () => {
    const previousEntry = (await node.getattr()) as WorldbookEntry;
    const updatedEntry = (await node.setattr(normalizedAttributes)) as WorldbookEntry;
    if (!updatedEntry || !previousEntry) {
      throw new ToolError('tool_use_error', '更新条目属性失败。');
    }

    return {
      filePath: normalized,
      attributes: sanitizeReturnedAttributes(updatedEntry),
      backup: {
        rollbackMethod: 'setAttributeRollback' as const,
        worldbookName,
        filePath: normalized,
        uid: (node as unknown as { uid: number }).uid,
        rollbackPatch: buildRollbackPatchFromPrevious(normalizedAttributes, previousEntry),
      },
    };
  });
}
