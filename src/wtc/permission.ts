import { ToolError } from '@/wtc/result';

type PermissionLevel = 1 | 2 | 3;

// 按世界书缓存本页会话内已授权的最高权限，避免重复弹窗。
const permissionCache = new Map<string, PermissionLevel>();

function requiredLevel(operation: 'read' | 'write' | 'delete'): PermissionLevel {
  switch (operation) {
    case 'read':
      return 1;
    case 'write':
      return 2;
    case 'delete':
      return 3;
  }
}

function operationText(operation: 'read' | 'write' | 'delete') {
  switch (operation) {
    case 'read':
      return '读取';
    case 'write':
      return '写入';
    case 'delete':
      return '删除';
  }
}

function downloadBackup(content: string, fileName: string, contentType: string) {
  const globalDownload = (window as typeof window & { download?: (content: string, fileName: string, contentType: string) => void })
    .download;

  if (typeof globalDownload === 'function') {
    globalDownload(content, fileName, contentType);
    return;
  }

  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function backupLorebook(worldbookName: string) {
  const data = await SillyTavern.loadWorldInfo(worldbookName);
  if (!data) {
    throw new ToolError('WORLD_NOT_FOUND', `世界书 '${worldbookName}' 不存在，无法备份。`);
  }

  downloadBackup(JSON.stringify(data), `${worldbookName}.json`, 'application/json');
}

export async function ensureLorebookPermission(worldbookName: string, operation: 'read' | 'write' | 'delete') {
  const level = requiredLevel(operation);
  // 高权限天然覆盖低权限，例如已允许 delete 时不必再次确认 read/write。
  if ((permissionCache.get(worldbookName) ?? 0) >= level) {
    return;
  }

  const result = await SillyTavern.callGenericPopup(
    `LLM 请求对 '/${worldbookName}' 进行 ${operationText(operation)}，是否允许？`,
    SillyTavern.POPUP_TYPE.CONFIRM,
    '',
    {
      okButton: '允许',
      cancelButton: '拒绝',
      customButtons: [
        {
          text: `对 '/${worldbookName}' 始终允许`,
          result: SillyTavern.POPUP_RESULT.CUSTOM1,
          appendAtEnd: true,
        },
        ...(operation === 'write'
          ? [
              {
                text: `备份 '/${worldbookName}' 并始终允许`,
                result: SillyTavern.POPUP_RESULT.CUSTOM2,
                appendAtEnd: true,
              },
            ]
          : []),
      ],
      wider: true,
    },
  );

  if (result === SillyTavern.POPUP_RESULT.CUSTOM1) {
    permissionCache.set(worldbookName, level);
    return;
  }
  if (result === SillyTavern.POPUP_RESULT.CUSTOM2) {
    await backupLorebook(worldbookName);
    permissionCache.set(worldbookName, level);
    return;
  }
  if (result === true || result === SillyTavern.POPUP_RESULT.AFFIRMATIVE) {
    return;
  }

  throw new ToolError('PERMISSION_DENIED', `用户拒绝对 '/${worldbookName}' 进行 ${operationText(operation)}。`);
}

export function resetPermissionCache() {
  // 工具注销时清空缓存，避免把本页状态泄漏到下一次注册周期。
  permissionCache.clear();
}
