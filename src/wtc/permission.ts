import { ToolError } from '@/wtc/result';

type PermissionLevel = 1 | 2 | 3;

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

export async function ensureLorebookPermission(worldbookName: string, operation: 'read' | 'write' | 'delete') {
  const level = requiredLevel(operation);
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
      ],
      wider: true,
    },
  );

  if (result === SillyTavern.POPUP_RESULT.CUSTOM1) {
    permissionCache.set(worldbookName, level);
    return;
  }
  if (result === true || result === SillyTavern.POPUP_RESULT.AFFIRMATIVE) {
    return;
  }

  throw new ToolError('PERMISSION_DENIED', `用户拒绝对 '/${worldbookName}' 进行 ${operationText(operation)}。`);
}

export function resetPermissionCache() {
  permissionCache.clear();
}

