import { editRollback, type EditBackup } from '@/wtc/actions/edit';
import { setAttributeRollback, type SetAttributeBackup } from '@/wtc/actions/set_attribute';
import { writeRollback, type WriteBackup } from '@/wtc/actions/write';
import type { ToolCallRecord } from '@/wtc/tool_ui/types';

export type RollbackBackup = WriteBackup | EditBackup | SetAttributeBackup;

function isPlainObject(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function getRollbackBackup(record: ToolCallRecord): RollbackBackup | undefined {
  if (!isPlainObject(record.result) || !isPlainObject(record.result.backup)) {
    return undefined;
  }

  const backup = record.result.backup as Record<string, any>;
  if (
    backup.rollbackMethod !== 'writeRollback' &&
    backup.rollbackMethod !== 'editRollback' &&
    backup.rollbackMethod !== 'setAttributeRollback'
  ) {
    return undefined;
  }

  return backup as RollbackBackup;
}

export function canRollbackRecord(record: ToolCallRecord) {
  if (record.error) {
    return false;
  }
  const backup = getRollbackBackup(record);
  if (!backup) {
    return false;
  }
  if (record.kind === 'Write') {
    return record.result?.type === 'update';
  }
  return record.kind === 'Edit' || record.kind === 'SetAttribute';
}

function rollbackVerb(record: ToolCallRecord) {
  if (record.kind === 'Write') {
    return '覆盖写入';
  }
  if (record.kind === 'Edit') {
    return '文本编辑';
  }
  if (record.kind === 'SetAttribute') {
    return '属性修改';
  }
  return '修改';
}

export async function confirmRollback(record: ToolCallRecord) {
  const backup = getRollbackBackup(record);
  if (!backup) {
    return false;
  }

  const result = await SillyTavern.callGenericPopup(
    `确认回滚 '${backup.filePath}' 的${rollbackVerb(record)}吗？`,
    SillyTavern.POPUP_TYPE.CONFIRM,
    '',
    {
      okButton: '回滚',
      cancelButton: '取消',
      wider: true,
    },
  );

  return result === true || result === SillyTavern.POPUP_RESULT.AFFIRMATIVE;
}

export async function executeRollback(record: ToolCallRecord) {
  const backup = getRollbackBackup(record);
  if (!backup) {
    throw new Error('当前记录不支持回滚。');
  }

  switch (backup.rollbackMethod) {
    case 'writeRollback':
      return await writeRollback(backup);
    case 'editRollback':
      return await editRollback(backup);
    case 'setAttributeRollback':
      return await setAttributeRollback(backup);
  }
}
