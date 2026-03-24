import { ToolError } from '@/wtc/result';
import { CHARACTERS_ROOT_PATH, LOREBOOKS_ROOT_PATH, normalizeVirtualPath, parseVirtualPath } from '@/wtc/store';

type PermissionLevel = 1 | 2 | 3;

type PermissionScope = {
  cacheKey: string;
  displayPath: string;
  kind: 'lorebook' | 'character';
  name: string;
};

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

async function ensureScopePermission(scope: PermissionScope, operation: 'read' | 'write' | 'delete') {
  const level = requiredLevel(operation);
  // 高权限天然覆盖低权限，例如已允许 delete 时不必再次确认 read/write。
  if ((permissionCache.get(scope.cacheKey) ?? 0) >= level) {
    return;
  }

  const result = await SillyTavern.callGenericPopup(
    `LLM 请求对 '${scope.displayPath}' 进行 ${operationText(operation)}，是否允许？`,
    SillyTavern.POPUP_TYPE.CONFIRM,
    '',
    {
      okButton: '允许',
      cancelButton: '拒绝',
      customButtons: [
        {
          text: `对 '${scope.displayPath}' 始终允许`,
          result: SillyTavern.POPUP_RESULT.CUSTOM1,
          appendAtEnd: true,
        },
        ...(operation === 'write'
          && scope.kind === 'lorebook'
          ? [
              {
                text: `备份 '${scope.displayPath}' 并始终允许`,
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
    permissionCache.set(scope.cacheKey, level);
    return;
  }
  if (result === SillyTavern.POPUP_RESULT.CUSTOM2) {
    await backupLorebook(scope.name);
    permissionCache.set(scope.cacheKey, level);
    return;
  }
  if (result === true || result === SillyTavern.POPUP_RESULT.AFFIRMATIVE) {
    return;
  }

  throw new ToolError('PERMISSION_DENIED', `用户拒绝对 '${scope.displayPath}' 进行 ${operationText(operation)}。`);
}

export async function ensureLorebookPermission(worldbookName: string, operation: 'read' | 'write' | 'delete') {
  return ensureScopePermission(
    {
      cacheKey: `lorebook:${worldbookName}`,
      displayPath: `${LOREBOOKS_ROOT_PATH}/${worldbookName}`,
      kind: 'lorebook',
      name: worldbookName,
    },
    operation,
  );
}

export async function ensureCharacterPermission(characterName: string, operation: 'read' | 'write' | 'delete') {
  return ensureScopePermission(
    {
      cacheKey: `character:${characterName}`,
      displayPath: `${CHARACTERS_ROOT_PATH}/${characterName}`,
      kind: 'character',
      name: characterName,
    },
    operation,
  );
}

export async function ensurePathPermission(
  path: string,
  operation: 'read' | 'write' | 'delete',
  options: { followCharacterWorldbook?: boolean } = {},
) {
  const normalized = normalizeVirtualPath(path);
  if (!normalized || normalized === '/') {
    return;
  }
  const parsed = parseVirtualPath(normalized);
  if (parsed.rootKind === 'lorebook') {
    await ensureLorebookPermission(parsed.entityName, operation);
    return;
  }
  if (parsed.rootKind !== 'character') {
    return;
  }
  if (options.followCharacterWorldbook && parsed.relativePath?.startsWith('WorldBook')) {
    const character = await getCharacter(parsed.entityName);
    if (!character.worldbook) {
      throw new ToolError('WORLD_NOT_FOUND', `角色卡 '${parsed.entityName}' 未绑定世界书。`);
    }
    await ensureLorebookPermission(character.worldbook, operation);
    return;
  }
  await ensureCharacterPermission(parsed.entityName, operation);
}

export function resetPermissionCache() {
  // 工具注销时清空缓存，避免把本页状态泄漏到下一次注册周期。
  permissionCache.clear();
}
