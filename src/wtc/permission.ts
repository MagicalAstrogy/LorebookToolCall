import { ToolError } from '@/wtc/result';
import { CHARACTERS_ROOT_PATH, LOREBOOKS_ROOT_PATH, PRESETS_ROOT_PATH, normalizeVirtualPath, parseVirtualPath } from '@/wtc/store';
import { resolvePermissionPresetName } from '@/wtc/fs_bind';
import { readonly, shallowReactive } from 'vue';

export type PermissionLevel = 1 | 2 | 3;

type PermissionScope = {
  cacheKey: string;
  displayPath: string;
  kind: 'lorebook' | 'character' | 'preset';
  name: string;
};

export interface GrantedPermission {
  cacheKey: string;
  displayPath: string;
  kind: PermissionScope['kind'];
  name: string;
  level: PermissionLevel;
}

// 按世界书缓存本页会话内已授权的最高权限，避免重复弹窗。
const permissionCache = new Map<string, GrantedPermission>();
const grantedPermissionState = shallowReactive<GrantedPermission[]>([]);

export const grantedPermissions = readonly(grantedPermissionState);

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

export function permissionLevelText(level: PermissionLevel) {
  switch (level) {
    case 1:
      return '读取';
    case 2:
      return '写入';
    case 3:
      return '删除';
  }
}

function operationText(operation: 'read' | 'write' | 'delete') {
  return permissionLevelText(requiredLevel(operation));
}

function upsertGrantedPermission(scope: PermissionScope, level: PermissionLevel) {
  const next: GrantedPermission = {
    cacheKey: scope.cacheKey,
    displayPath: scope.displayPath,
    kind: scope.kind,
    name: scope.name,
    level,
  };
  permissionCache.set(scope.cacheKey, next);

  const existingIndex = grantedPermissionState.findIndex(permission => permission.cacheKey === scope.cacheKey);
  if (existingIndex >= 0) {
    grantedPermissionState.splice(existingIndex, 1, next);
  } else {
    grantedPermissionState.push(next);
  }

  grantedPermissionState.sort((left, right) => {
    if (left.displayPath === right.displayPath) {
      return left.level - right.level;
    }
    return left.displayPath.localeCompare(right.displayPath, 'zh-Hans-CN');
  });
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

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.setAttribute('download', fileName);
  document.body.appendChild(anchor);
  anchor.click();
  URL.revokeObjectURL(anchor.href);
  document.body.removeChild(anchor);
}

async function backupLorebook(worldbookName: string) {
  const data = await SillyTavern.loadWorldInfo(worldbookName);
  if (!data) {
    throw new ToolError('WORLD_NOT_FOUND', `世界书 '${worldbookName}' 不存在，无法备份。`);
  }

  downloadBackup(JSON.stringify(data), `${worldbookName}.json`, 'application/json');
}

async function backupCharacter(characterName: string) {
  const avatarUrl = `${characterName}.png`;
  const response = await fetch('/api/characters/export', {
    method: 'POST',
    headers: SillyTavern.getRequestHeaders(),
    body: JSON.stringify({
      format: 'json',
      avatar_url: avatarUrl,
    }),
  });

  if (!response.ok) {
    throw new ToolError('tool_use_error', `角色卡 '${characterName}' 备份失败: ${response.status}`);
  }

  const blob = await response.blob();
  downloadBlob(blob, avatarUrl.replace(/\.png$/i, '.json'));
}

async function ensureScopePermission(scope: PermissionScope, operation: 'read' | 'write' | 'delete') {
  const level = requiredLevel(operation);
  // 高权限天然覆盖低权限，例如已允许 delete 时不必再次确认 read/write。
  if ((permissionCache.get(scope.cacheKey)?.level ?? 0) >= level) {
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
          && (scope.kind === 'lorebook' || scope.kind === 'character')
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
    upsertGrantedPermission(scope, level);
    return;
  }
  if (result === SillyTavern.POPUP_RESULT.CUSTOM2) {
    if (scope.kind === 'lorebook') {
      await backupLorebook(scope.name);
    } else {
      await backupCharacter(scope.name);
    }
    upsertGrantedPermission(scope, level);
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

export async function ensurePresetPermission(presetName: string, operation: 'read' | 'write' | 'delete') {
  // Preset 的权限粒度固定到 /Presets/<PresetName>，不再细分到单个 prompt。
  return ensureScopePermission(
    {
      cacheKey: `preset:${presetName}`,
      displayPath: `${PRESETS_ROOT_PATH}/${presetName}`,
      kind: 'preset',
      name: presetName,
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
  if (parsed.rootKind === 'preset') {
    // Current alias 的授权要折算到真实 preset 名，避免缓存键漂移在虚拟别名上。
    const presetName = resolvePermissionPresetName(normalized);
    if (presetName) {
      await ensurePresetPermission(presetName, operation);
    }
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
  grantedPermissionState.splice(0, grantedPermissionState.length);
}
