import YAML from 'yaml';
import { z } from 'zod';
import { ToolError, invalidPathDetail } from '@/wtc/result';
import {
  CHARACTERS_ROOT_PATH,
  PathMappedEntry,
  isSafeSinglePathSegment,
  normalizeVirtualPath,
  parseVirtualPath,
  toCharacterRootPath,
  toLorebookRootPath,
  toPresetRootPath,
} from '@/wtc/store';

type RegexIndexBuildResult = {
  byName: Map<string, TavernRegex>;
  conflicts: Set<string>;
};

type ScriptIndexBuildResult = {
  byName: Map<string, Script>;
  conflicts: Set<string>;
};

type PresetPromptSource = 'prompts' | 'prompts_unused';

type PresetPromptIndexBuildResult = {
  files: PresetIndexedPrompt[];
  exactFiles: Map<string, PresetIndexedPrompt>;
  conflicts: Set<string>;
  directories: string[];
};

type ParsedFrontMatter<T> =
  | {
      kind: 'missing';
      body: string;
    }
  | {
      kind: 'valid';
      body: string;
      frontMatter: T;
    }
  | {
      kind: 'invalid';
      body: string;
      message: string;
    };

export type CharacterBinding =
  | { kind: 'character_root'; characterName: string }
  | { kind: 'description'; characterName: string }
  | { kind: 'worldbook_link'; characterName: string; remainder: string | null }
  | { kind: 'first_messages_dir'; characterName: string }
  | { kind: 'first_message'; characterName: string; index: number }
  | { kind: 'regex_dir'; characterName: string }
  | { kind: 'regex_file'; characterName: string; scriptName: string }
  | { kind: 'scripts_dir'; characterName: string }
  | { kind: 'script_file'; characterName: string; scriptName: string };

export type PresetBinding =
  | { kind: 'preset_root'; presetName: string }
  | { kind: 'preset_prompt'; presetName: string; promptPath: string };

export interface CharacterView {
  characterName: string;
  character: Character;
  worldbookTargetPath: string | null;
  regexByName: Map<string, TavernRegex>;
  regexConflicts: Set<string>;
  scriptsByName: Map<string, Script>;
  scriptConflicts: Set<string>;
}

export interface PresetIndexedPrompt extends PathMappedEntry<PresetPrompt> {
  source: PresetPromptSource;
}

export interface PresetView {
  presetName: string;
  rootPath: string;
  files: PresetIndexedPrompt[];
  directories: string[];
  exactFiles: Map<string, PresetIndexedPrompt>;
  conflicts: Set<string>;
}

export interface WorldbookBackedFileTarget {
  logicalPath: string;
  targetPath: string;
  worldbookName: string;
  entryPath: string;
}

const tavernRegexTrimStringsSchema = z.preprocess(value => {
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === 'string') {
    return value === '' ? [] : [value];
  }
  return value;
}, z.array(z.string()));

export const REGEX_YFM_SCHEMA_PATH = '/Schemas/Regex.json';
export const SCRIPT_YFM_SCHEMA_PATH = '/Schemas/Script.json';
export const PRESET_YFM_SCHEMA_PATH = '/Schemas/Preset.json';

// PresetPrompt.id 运行时允许自定义字符串；这里保留内置 ID 列表，仅用于补充导出 schema 的描述信息。
const PRESET_SYSTEM_PROMPT_IDS = ['main', 'nsfw', 'jailbreak', 'enhanceDefinitions'] as const;
const PRESET_PLACEHOLDER_PROMPT_IDS = [
  'worldInfoBefore',
  'personaDescription',
  'charDescription',
  'charPersonality',
  'scenario',
  'worldInfoAfter',
  'dialogueExamples',
  'chatHistory',
] as const;

export const tavernRegexSchema = z
  .object({
    id: z.string().describe('酒馆正则的唯一 ID。'),
    script_name: z.string().describe('正则名称；在角色卡扩展数据里作为唯一名称使用。'),
    enabled: z.boolean().describe('是否启用该正则。'),
    scope: z
      .enum(['global', 'character'])
      .optional()
      .describe("旧版作用域字段。有效值：'global' 表示全局正则，'character' 表示角色卡局部正则。新 API 中该字段已不再必需，因此保持可选。"),
    find_regex: z.string().describe('查找用的正则表达式文本。'),
    replace_string: z.string().describe('替换后的文本。'),
    trim_strings: tavernRegexTrimStringsSchema.describe("预处理要裁掉的字符串列表。兼容 string[]、单个 string，以及空字符串 ''（会自动转成空数组）。"),
    source: z
      .object({
        user_input: z.boolean().describe('是否对用户输入生效。'),
        ai_output: z.boolean().describe('是否对 AI 输出生效。'),
        slash_command: z.boolean().describe('是否对 slash command 生效。'),
        world_info: z.boolean().describe('是否对世界书 / world info 生效。'),
      })
      .describe("正则作用的文本来源。当前支持的来源键为：user_input、ai_output、slash_command、world_info。"),
    destination: z
      .object({
        display: z.boolean().describe('是否在显示文本时生效。'),
        prompt: z.boolean().describe('是否在作为提示词时生效。'),
      })
      .describe("正则作用的目标。有效目标键为：display（显示文本）和 prompt（提示词）。"),
    run_on_edit: z.boolean().describe('是否在编辑消息时也执行该正则。'),
    min_depth: z.number().int().nullable().describe('最小深度；null 表示不限制。'),
    max_depth: z.number().int().nullable().describe('最大深度；null 表示不限制。'),
  })
  .describe('酒馆正则对象：描述一条可应用于用户输入、AI 输出、slash command 或 world info 的替换规则。')
  .strict();

export const tavernRegexFrontMatterSchema = tavernRegexSchema.omit({
  script_name: true,
  replace_string: true,
}).extend({
  $schema: z.literal(REGEX_YFM_SCHEMA_PATH).optional(),
});

export const scriptSchema = z
  .object({
    type: z.literal('script').describe("节点类型；对脚本节点固定为 'script'。"),
    enabled: z.boolean().describe('是否启用该脚本。'),
    name: z.string().describe('脚本名称。'),
    id: z.string().describe('脚本唯一 ID。'),
    content: z.string().describe('脚本源码内容。'),
    info: z.string().describe('脚本说明 / 简介文本。'),
    button: z
      .object({
        enabled: z.boolean().describe('是否启用脚本按钮功能。'),
        buttons: z.array(
          z.object({
            name: z.string().describe('按钮显示名称。'),
            visible: z.boolean().describe('按钮是否可见。'),
          }),
        ),
      })
      .describe('脚本按钮配置，包括是否启用按钮，以及按钮列表。'),
    data: z.record(z.string(), z.any()).describe('脚本绑定的额外数据；键必须是字符串，值可以是任意类型。'),
  })
  .describe('酒馆助手脚本对象：表示一个 type 为 script 的脚本节点，不包含 folder 节点。')
  .strict();

export const scriptFrontMatterSchema = scriptSchema.omit({
  name: true,
  content: true,
}).extend({
  $schema: z.literal(SCRIPT_YFM_SCHEMA_PATH).optional(),
});

export const presetPromptFrontMatterSchema = z
  .object({
    // 不能直接收窄成 enum，否则会错误拒绝普通 prompt 的自定义 id。
    id: z.string().describe(
      `Preset prompt 的逻辑 ID。内置系统 prompt ID: ${PRESET_SYSTEM_PROMPT_IDS.join('、')}；内置占位符 prompt ID: ${PRESET_PLACEHOLDER_PROMPT_IDS.join(
        '、',
      )}；也允许使用自定义字符串作为普通 prompt ID。`,
    ),
    enabled: z.boolean().describe('是否启用该 prompt。'),
    position: z
      .union([
        z
          .object({
            type: z.literal('relative').describe("固定值 'relative'：按 prompt 相对顺序插入。"),
          })
          .strict(),
        z
          .object({
            type: z.literal('in_chat').describe("固定值 'in_chat'：插入到聊天记录中的指定深度与顺序。"),
            depth: z.number().int().describe("仅当 type 为 'in_chat' 时使用：插入到聊天记录的对应深度。"),
            order: z.number().int().describe("仅当 type 为 'in_chat' 时使用：同一深度下的顺序。"),
          })
          .strict(),
      ])
      .describe("插入位置。'relative' 表示相对顺序，'in_chat' 表示插入聊天上下文中的指定深度和顺序。"),
    role: z.enum(['system', 'user', 'assistant']).describe("发送给模型时使用的角色。有效值：'system'、'user'、'assistant'。"),
    extra: z.record(z.string(), z.any()).optional().describe('额外元数据。'),
    $schema: z.literal(PRESET_YFM_SCHEMA_PATH).optional(),
  })
  .strict();

function buildSchemaMessage(error: z.ZodError) {
  return error.issues.map(issue => `${issue.path.join('.') || '<root>'}: ${issue.message}`).join('; ');
}

function parseYamlFrontMatter<T>(text: string, schema: z.ZodType<T>): ParsedFrontMatter<T> {
  if (!text.startsWith('---\n') && !text.startsWith('---\r\n')) {
    return {
      kind: 'missing',
      body: text,
    };
  }

  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n([\s\S]*))?$/);
  if (!match) {
    return {
      kind: 'invalid',
      body: text,
      message: 'front matter 缺少结束分隔符。',
    };
  }

  try {
    const parsedYaml = YAML.parse(match[1]) ?? {};
    const parsed = schema.safeParse(parsedYaml);
    if (!parsed.success) {
      return {
        kind: 'invalid',
        body: match[2] ?? '',
        message: buildSchemaMessage(parsed.error),
      };
    }
    return {
      kind: 'valid',
      body: match[2] ?? '',
      frontMatter: parsed.data,
    };
  } catch (error) {
    return {
      kind: 'invalid',
      body: match[2] ?? '',
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

function stringifyFrontMatter(frontMatter: Record<string, unknown>, body: string) {
  const yamlBlock = YAML.stringify(frontMatter).trimEnd();
  return `---\n${yamlBlock}\n---\n${body}`;
}

function withSchemaReference(frontMatter: Record<string, unknown>, schemaPath: string) {
  return {
    $schema: schemaPath,
    ...frontMatter,
  };
}

function withoutSchemaReference<T extends { $schema?: string }>(frontMatter: T): Omit<T, '$schema'> {
  const { $schema: _schema, ...rest } = frontMatter;
  return rest;
}

function allocateId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function createDefaultCharacterRegexFrontMatter(): z.infer<typeof tavernRegexFrontMatterSchema> {
  return {
    id: allocateId('regex'),
    enabled: true,
    find_regex: '',
    trim_strings: [],
    source: {
      user_input: false,
      ai_output: false,
      slash_command: false,
      world_info: false,
    },
    destination: {
      display: true,
      prompt: false,
    },
    run_on_edit: false,
    min_depth: null,
    max_depth: null,
  };
}

function createDefaultCharacterScriptFrontMatter(): z.infer<typeof scriptFrontMatterSchema> {
  return {
    type: 'script',
    enabled: true,
    id: allocateId('script'),
    info: '',
    button: {
      enabled: false,
      buttons: [],
    },
    data: {},
  };
}

function createDefaultPresetPromptFrontMatter(): z.infer<typeof presetPromptFrontMatterSchema> {
  // 新建 preset prompt 时沿用酒馆里最保守的默认值，避免额外推断语义。
  return {
    id: allocateId('preset-prompt'),
    enabled: true,
    position: {
      type: 'relative',
    },
    role: 'system',
    extra: {},
  };
}

function buildRegexIndex(regexes: unknown[]): RegexIndexBuildResult {
  const byName = new Map<string, TavernRegex>();
  const conflicts = new Set<string>();
  for (const item of regexes) {
    const parsed = tavernRegexSchema.safeParse(item);
    if (!parsed.success || !isSafeSinglePathSegment(parsed.data.script_name)) {
      continue;
    }
    if (byName.has(parsed.data.script_name)) {
      conflicts.add(parsed.data.script_name);
      byName.delete(parsed.data.script_name);
      continue;
    }
    if (conflicts.has(parsed.data.script_name)) {
      continue;
    }
    byName.set(parsed.data.script_name, parsed.data);
  }
  return { byName, conflicts };
}

function buildScriptIndex(scripts: unknown[]): ScriptIndexBuildResult {
  const byName = new Map<string, Script>();
  const conflicts = new Set<string>();
  for (const item of scripts) {
    const parsed = scriptSchema.safeParse(item);
    if (!parsed.success || !isSafeSinglePathSegment(parsed.data.name)) {
      continue;
    }
    if (byName.has(parsed.data.name)) {
      conflicts.add(parsed.data.name);
      byName.delete(parsed.data.name);
      continue;
    }
    if (conflicts.has(parsed.data.name)) {
      continue;
    }
    byName.set(parsed.data.name, parsed.data);
  }
  return { byName, conflicts };
}

function buildPresetPromptIndex(presetName: string, preset: Preset): PresetPromptIndexBuildResult {
  // Preset 把 prompts 和 prompts_unused 合并投影到同一棵路径树里，并在这里一次性计算冲突。
  const rootPath = toPresetRootPath(presetName);
  const files: PresetIndexedPrompt[] = [];
  const exactFiles = new Map<string, PresetIndexedPrompt>();
  const conflicts = new Set<string>();
  const directories = new Set<string>([`${rootPath}/`]);

  let nextUid = 0;
  for (const [source, prompts] of [
    ['prompts', preset.prompts],
    ['prompts_unused', preset.prompts_unused],
  ] as const) {
    for (const prompt of prompts) {
      if (typeof prompt.name !== 'string' || prompt.name === '') {
        continue;
      }
      const normalized = toPresetPromptFilePath(rootPath, prompt.name);
      if (!normalized || normalized === rootPath || !normalized.startsWith(`${rootPath}/`)) {
        continue;
      }
      const entryPath = normalized.slice(rootPath.length + 1);
      const indexed: PresetIndexedPrompt = {
        filePath: normalized,
        entryPath,
        uid: nextUid,
        raw: structuredClone(prompt),
        source,
      };
      nextUid += 1;
      files.push(indexed);
      if (exactFiles.has(normalized)) {
        conflicts.add(normalized);
      } else {
        exactFiles.set(normalized, indexed);
      }

      const parts = entryPath.split('/');
      for (let index = 0; index < parts.length - 1; index += 1) {
        directories.add(`${rootPath}/${parts.slice(0, index + 1).join('/')}/`);
      }
    }
  }

  const occupiedPaths = new Set(
    [...directories]
      .map(directory => directory.replace(/\/+$/, ''))
      .filter(directory => directory !== '' && directory !== rootPath),
  );
  const visibleFiles: PresetIndexedPrompt[] = [];
  const shadowedConflicts = new Set<string>();
  for (const file of files) {
    if (occupiedPaths.has(file.filePath)) {
      shadowedConflicts.add(file.filePath);
      continue;
    }
    visibleFiles.push(file);
  }

  const visibleExactFiles = new Map<string, PresetIndexedPrompt>();
  const allConflicts = new Set<string>([...conflicts, ...shadowedConflicts]);
  for (const file of visibleFiles) {
    if (visibleExactFiles.has(file.filePath)) {
      allConflicts.add(file.filePath);
      continue;
    }
    visibleExactFiles.set(file.filePath, file);
  }

  return {
    files: visibleFiles.sort((left, right) => left.filePath.localeCompare(right.filePath)),
    directories: [...directories].sort(),
    exactFiles: visibleExactFiles,
    conflicts: allConflicts,
  };
}

function toPresetPromptFilePath(rootPath: string, promptName: string) {
  // Prompt 名允许带子路径，但必须仍落在当前 preset 根目录下。
  const normalized = normalizeVirtualPath(`${rootPath}/${promptName}`);
  if (!normalized || normalized === rootPath || !normalized.startsWith(`${rootPath}/`)) {
    return null;
  }
  return normalized;
}

function resolvePromptContent(prompt: PresetPrompt, body: string) {
  return body === '' && prompt.content === undefined ? undefined : body;
}

function materializePresetPrompt(
  promptPath: string,
  frontMatter: Omit<z.infer<typeof presetPromptFrontMatterSchema>, '$schema'>,
  body: string,
  previous?: PresetPrompt | null,
): PresetPrompt {
  // name/content 由文件路径和正文承载；其余字段从 front matter 回填。
  const nextPrompt = {
    name: promptPath,
    content: previous ? resolvePromptContent(previous, body) : body,
    id: frontMatter.id,
    enabled: frontMatter.enabled,
    role: frontMatter.role,
    position: frontMatter.position,
    ...(frontMatter.extra !== undefined ? { extra: frontMatter.extra } : {}),
  };
  return nextPrompt;
}

export async function openCharacterView(characterName: string): Promise<CharacterView> {
  const character = await getCharacter(characterName);
  const regexIndex = buildRegexIndex(character.extensions?.regex_scripts ?? []);
  const scriptIndex = buildScriptIndex(character.extensions?.tavern_helper?.scripts ?? []);
  return {
    characterName,
    character,
    worldbookTargetPath: character.worldbook && isSafeSinglePathSegment(character.worldbook) ? toLorebookRootPath(character.worldbook) : null,
    regexByName: regexIndex.byName,
    regexConflicts: regexIndex.conflicts,
    scriptsByName: scriptIndex.byName,
    scriptConflicts: scriptIndex.conflicts,
  };
}

export function getSafeCharacterNames() {
  return getCharacterNames().filter(isSafeSinglePathSegment).sort();
}

export function getSafeWorldbookNames() {
  return getWorldbookNames().filter(isSafeSinglePathSegment).sort();
}

function canOpenPreset(presetName: string) {
  // 宿主侧 getPreset() 可能抛错；映射层把这种 preset 视为不可见。
  try {
    getPreset(presetName);
    return true;
  } catch {
    return false;
  }
}

export function getSafePresetNames() {
  // /Presets 只暴露可安全映射为单一路径段，且内容可成功读取的 preset。
  return getPresetNames()
    .filter(isSafeSinglePathSegment)
    .filter(canOpenPreset)
    .sort();
}

export function resolveCurrentPresetName() {
  const loadedName = getLoadedPresetName();
  if (!isSafeSinglePathSegment(loadedName)) {
    return null;
  }
  return canOpenPreset(loadedName) ? loadedName : null;
}

export function hasPresetCurrentConflict() {
  return getSafePresetNames().includes('Current');
}

export function openPresetView(presetName: string): PresetView {
  // PresetView 和 LorebookView 一样，是单次操作内使用的短生命周期快照。
  let preset: Preset;
  try {
    preset = getPreset(presetName);
  } catch {
    throw new ToolError('ENTRY_NOT_FOUND', `Preset '${presetName}' 不存在。`);
  }
  const index = buildPresetPromptIndex(presetName, preset);
  return {
    presetName,
    rootPath: toPresetRootPath(presetName),
    files: index.files,
    directories: index.directories,
    exactFiles: index.exactFiles,
    conflicts: index.conflicts,
  };
}

export function parseCharacterBinding(path: string): CharacterBinding | null {
  const parsed = parseVirtualPath(path);
  if (parsed.rootKind !== 'character') {
    return null;
  }
  const characterName = parsed.entityName;
  const relativePath = parsed.relativePath;
  if (!relativePath) {
    return { kind: 'character_root', characterName };
  }
  if (relativePath === 'Description.md') {
    return { kind: 'description', characterName };
  }
  if (relativePath === 'WorldBook' || relativePath.startsWith('WorldBook/')) {
    return {
      kind: 'worldbook_link',
      characterName,
      remainder: relativePath === 'WorldBook' ? null : relativePath.slice('WorldBook/'.length),
    };
  }
  if (relativePath === 'FirstMessages') {
    return { kind: 'first_messages_dir', characterName };
  }
  if (relativePath.startsWith('FirstMessages/')) {
    const indexText = relativePath.slice('FirstMessages/'.length);
    if (/^\d+$/.test(indexText)) {
      return {
        kind: 'first_message',
        characterName,
        index: Number(indexText),
      };
    }
    return null;
  }
  if (relativePath === 'Regex') {
    return { kind: 'regex_dir', characterName };
  }
  if (relativePath.startsWith('Regex/')) {
    const scriptName = relativePath.slice('Regex/'.length);
    if (isSafeSinglePathSegment(scriptName)) {
      return { kind: 'regex_file', characterName, scriptName };
    }
    return null;
  }
  if (relativePath === 'Scripts') {
    return { kind: 'scripts_dir', characterName };
  }
  if (relativePath.startsWith('Scripts/')) {
    const scriptName = relativePath.slice('Scripts/'.length);
    if (isSafeSinglePathSegment(scriptName)) {
      return { kind: 'script_file', characterName, scriptName };
    }
    return null;
  }
  return null;
}

export function parsePresetBinding(path: string): PresetBinding | null {
  const parsed = parseVirtualPath(path);
  if (parsed.rootKind !== 'preset') {
    return null;
  }
  const presetName = parsed.entityName;
  const relativePath = parsed.relativePath;
  if (!relativePath) {
    return {
      kind: 'preset_root',
      presetName,
    };
  }
  return {
    kind: 'preset_prompt',
    presetName,
    promptPath: relativePath,
  };
}

function resolvePresetBindingPresetName(logicalPresetName: string) {
  // /Presets/Current 需要先解引用到真实 preset 名；其余路径直接使用字面名称。
  if (logicalPresetName !== 'Current') {
    if (!canOpenPreset(logicalPresetName)) {
      throw new ToolError('ENTRY_NOT_FOUND', `Preset '${logicalPresetName}' 不存在。`);
    }
    return logicalPresetName;
  }
  if (hasPresetCurrentConflict()) {
    throw new ToolError('PATH_CONFLICT', `路径 '${toPresetRootPath('Current')}' 存在重名冲突。`);
  }
  const currentPresetName = resolveCurrentPresetName();
  if (!currentPresetName) {
    throw new ToolError('ENTRY_NOT_FOUND', `条目 '${toPresetRootPath('Current')}' 不存在。`);
  }
  return currentPresetName;
}

export function resolvePermissionPresetName(path: string) {
  const binding = parsePresetBinding(path);
  if (!binding) {
    return null;
  }
  return resolvePresetBindingPresetName(binding.presetName);
}

export function serializeCharacterRegex(regex: TavernRegex) {
  const { script_name: _scriptName, replace_string, ...frontMatter } = regex;
  return stringifyFrontMatter(withSchemaReference(frontMatter, REGEX_YFM_SCHEMA_PATH), replace_string);
}

export function serializeCharacterScript(script: Script) {
  const { name: _name, content, ...frontMatter } = script;
  return stringifyFrontMatter(withSchemaReference(frontMatter, SCRIPT_YFM_SCHEMA_PATH), content);
}

export function serializePresetPrompt(prompt: PresetPrompt) {
  const { name: _name, content, ...frontMatter } = prompt;
  return stringifyFrontMatter(withSchemaReference(frontMatter, PRESET_YFM_SCHEMA_PATH), content ?? '');
}

async function updateCharacterRegex(
  characterName: string,
  scriptName: string,
  content: string,
): Promise<{ mode: 'create' | 'update'; originalContent: string | null; warnings: string[] }> {
  const view = await openCharacterView(characterName);
  if (view.regexConflicts.has(scriptName)) {
    throw new ToolError('PATH_CONFLICT', `Regex '${scriptName}' 存在重名冲突。`);
  }

  const previous = view.regexByName.get(scriptName) ?? null;
  const parsed = parseYamlFrontMatter(content, tavernRegexFrontMatterSchema);
  const warnings: string[] = [];
  let nextRegex: TavernRegex;

  if (previous) {
    if (parsed.kind === 'valid') {
      nextRegex = tavernRegexSchema.parse({
        ...withoutSchemaReference(parsed.frontMatter),
        script_name: scriptName,
        replace_string: parsed.body,
      });
    } else if (parsed.kind === 'missing') {
      warnings.push('Front Matter Missing');
      nextRegex = {
        ...previous,
        script_name: scriptName,
        replace_string: parsed.body,
      };
    } else {
      warnings.push('Invalid Front Matter,Ignored');
      nextRegex = {
        ...previous,
        script_name: scriptName,
        replace_string: parsed.body,
      };
    }
  } else {
    if (parsed.kind === 'invalid') {
      throw new ToolError('InputValidationError', `Regex Front Matter 不合法: ${parsed.message}`, [
        invalidPathDetail(`${toCharacterRootPath(characterName)}/Regex/${scriptName}`),
      ]);
    }
    const frontMatter = parsed.kind === 'missing' ? createDefaultCharacterRegexFrontMatter() : withoutSchemaReference(parsed.frontMatter);
    nextRegex = tavernRegexSchema.parse({
      ...frontMatter,
      script_name: scriptName,
      replace_string: parsed.body,
    });
  }

  await updateCharacterWith(characterName, character => {
    const nextCharacter = structuredClone(character);
    const regexes = [...(nextCharacter.extensions.regex_scripts ?? [])];
    const index = regexes.findIndex(item => tavernRegexSchema.safeParse(item).success && (item as TavernRegex).script_name === scriptName);
    if (index >= 0) {
      regexes[index] = nextRegex;
    } else {
      regexes.push(nextRegex);
    }
    nextCharacter.extensions.regex_scripts = regexes;
    return nextCharacter;
  });

  return {
    mode: previous ? 'update' : 'create',
    originalContent: previous ? serializeCharacterRegex(previous) : null,
    warnings,
  };
}

async function updateCharacterScript(
  characterName: string,
  scriptName: string,
  content: string,
): Promise<{ mode: 'create' | 'update'; originalContent: string | null; warnings: string[] }> {
  const view = await openCharacterView(characterName);
  if (view.scriptConflicts.has(scriptName)) {
    throw new ToolError('PATH_CONFLICT', `Script '${scriptName}' 存在重名冲突。`);
  }

  const previous = view.scriptsByName.get(scriptName) ?? null;
  const parsed = parseYamlFrontMatter(content, scriptFrontMatterSchema);
  const warnings: string[] = [];
  let nextScript: Script;

  if (previous) {
    if (parsed.kind === 'valid') {
      nextScript = scriptSchema.parse({
        ...withoutSchemaReference(parsed.frontMatter),
        name: scriptName,
        content: parsed.body,
      });
    } else if (parsed.kind === 'missing') {
      warnings.push('Front Matter Missing');
      nextScript = {
        ...previous,
        name: scriptName,
        content: parsed.body,
      };
    } else {
      warnings.push('Invalid Front Matter,Ignored');
      nextScript = {
        ...previous,
        name: scriptName,
        content: parsed.body,
      };
    }
  } else {
    if (parsed.kind === 'invalid') {
      throw new ToolError('InputValidationError', `Script Front Matter 不合法: ${parsed.message}`, [
        invalidPathDetail(`${toCharacterRootPath(characterName)}/Scripts/${scriptName}`),
      ]);
    }
    const frontMatter = parsed.kind === 'missing' ? createDefaultCharacterScriptFrontMatter() : withoutSchemaReference(parsed.frontMatter);
    nextScript = scriptSchema.parse({
      ...frontMatter,
      name: scriptName,
      content: parsed.body,
    });
  }

  await updateCharacterWith(characterName, character => {
    const nextCharacter = structuredClone(character);
    const scripts = [...(nextCharacter.extensions.tavern_helper?.scripts ?? [])];
    const index = scripts.findIndex(item => scriptSchema.safeParse(item).success && (item as Script).name === scriptName);
    if (index >= 0) {
      scripts[index] = nextScript;
    } else {
      scripts.push(nextScript);
    }
    nextCharacter.extensions.tavern_helper = {
      ...(nextCharacter.extensions.tavern_helper ?? { variables: {} }),
      scripts,
    };
    return nextCharacter;
  });

  return {
    mode: previous ? 'update' : 'create',
    originalContent: previous ? serializeCharacterScript(previous) : null,
    warnings,
  };
}

async function updatePresetPrompt(
  logicalPresetName: string,
  promptPath: string,
  content: string,
): Promise<{ mode: 'create' | 'update'; originalContent: string | null; warnings: string[] }> {
  // create 固定写入 prompts；update 则保留原来的 prompts/prompts_unused 归属。
  const presetName = resolvePresetBindingPresetName(logicalPresetName);
  const view = openPresetView(presetName);
  const filePath = `${toPresetRootPath(logicalPresetName)}/${promptPath}`;
  const actualFilePath = `${toPresetRootPath(presetName)}/${promptPath}`;
  if (view.conflicts.has(actualFilePath)) {
    throw new ToolError('PATH_CONFLICT', `Prompt '${filePath}' 存在重名冲突。`);
  }

  const previous = view.exactFiles.get(actualFilePath) ?? null;
  const parsed = parseYamlFrontMatter(content, presetPromptFrontMatterSchema);
  const warnings: string[] = [];
  let nextPrompt: PresetPrompt;

  if (previous) {
    if (parsed.kind === 'valid') {
      nextPrompt = materializePresetPrompt(promptPath, withoutSchemaReference(parsed.frontMatter), parsed.body, previous.raw);
    } else if (parsed.kind === 'missing') {
      warnings.push('Front Matter Missing');
      nextPrompt = {
        ...structuredClone(previous.raw),
        name: promptPath,
        content: resolvePromptContent(previous.raw, parsed.body),
      };
      if (nextPrompt.content === undefined) {
        delete nextPrompt.content;
      }
    } else {
      warnings.push('Invalid Front Matter,Ignored');
      nextPrompt = {
        ...structuredClone(previous.raw),
        name: promptPath,
        content: resolvePromptContent(previous.raw, parsed.body),
      };
      if (nextPrompt.content === undefined) {
        delete nextPrompt.content;
      }
    }
  } else {
    if (parsed.kind === 'invalid') {
      throw new ToolError('InputValidationError', `Preset Front Matter 不合法: ${parsed.message}`, [
        invalidPathDetail(`${toPresetRootPath(logicalPresetName)}/${promptPath}`),
      ]);
    }
    const frontMatter = parsed.kind === 'missing' ? createDefaultPresetPromptFrontMatter() : withoutSchemaReference(parsed.frontMatter);
    nextPrompt = materializePresetPrompt(promptPath, frontMatter, parsed.body);
  }

  const targetSource = previous?.source ?? 'prompts';
  const replaceInSource = (prompts: PresetPrompt[], source: PresetPromptSource) =>
    prompts
      .filter(prompt => {
        const promptFilePath = toPresetPromptFilePath(toPresetRootPath(presetName), prompt.name);
        return promptFilePath !== actualFilePath || source !== targetSource;
      })
      .concat(source === targetSource ? [nextPrompt] : []);

  const preset = structuredClone(getPreset(presetName));
  preset.prompts = replaceInSource(preset.prompts, 'prompts');
  preset.prompts_unused = replaceInSource(preset.prompts_unused, 'prompts_unused');
  await replacePreset(presetName, preset, { render: 'debounced' });

  return {
    mode: previous ? 'update' : 'create',
    originalContent: previous ? serializePresetPrompt(previous.raw) : null,
    warnings,
  };
}

export async function readCharacterBoundFile(path: string): Promise<string> {
  const binding = parseCharacterBinding(path);
  if (!binding) {
    throw new ToolError('ENTRY_NOT_FOUND', `路径 '${path}' 不存在。`);
  }
  const view = await openCharacterView(binding.characterName);
  switch (binding.kind) {
    case 'description':
      return view.character.description;
    case 'first_message': {
      const content = view.character.first_messages[binding.index];
      if (content === undefined) {
        throw new ToolError('ENTRY_NOT_FOUND', `条目 '${path}' 不存在。`);
      }
      return content;
    }
    case 'regex_file': {
      if (view.regexConflicts.has(binding.scriptName)) {
        throw new ToolError('PATH_CONFLICT', `Regex '${binding.scriptName}' 存在重名冲突。`);
      }
      const regex = view.regexByName.get(binding.scriptName);
      if (!regex) {
        throw new ToolError('ENTRY_NOT_FOUND', `条目 '${path}' 不存在。`);
      }
      return serializeCharacterRegex(regex);
    }
    case 'script_file': {
      if (view.scriptConflicts.has(binding.scriptName)) {
        throw new ToolError('PATH_CONFLICT', `Script '${binding.scriptName}' 存在重名冲突。`);
      }
      const script = view.scriptsByName.get(binding.scriptName);
      if (!script) {
        throw new ToolError('ENTRY_NOT_FOUND', `条目 '${path}' 不存在。`);
      }
      return serializeCharacterScript(script);
    }
    default:
      throw new ToolError('InputValidationError', 'file_path 必须指向一个具体文件，而不是目录。', [invalidPathDetail(path)]);
  }
}

export async function readPresetBoundFile(path: string): Promise<string> {
  // Preset 文件读操作始终走逻辑路径；Current alias 会在这里折算到真实 preset。
  const binding = parsePresetBinding(path);
  if (!binding) {
    throw new ToolError('ENTRY_NOT_FOUND', `路径 '${path}' 不存在。`);
  }
  if (binding.kind !== 'preset_prompt') {
    throw new ToolError('InputValidationError', 'file_path 必须指向一个具体文件，而不是目录。', [invalidPathDetail(path)]);
  }
  const presetName = resolvePresetBindingPresetName(binding.presetName);
  const view = openPresetView(presetName);
  const actualFilePath = `${toPresetRootPath(presetName)}/${binding.promptPath}`;
  if (view.conflicts.has(actualFilePath)) {
    throw new ToolError('PATH_CONFLICT', `Prompt '${path}' 存在重名冲突。`);
  }
  const prompt = view.exactFiles.get(actualFilePath);
  if (!prompt) {
    throw new ToolError('ENTRY_NOT_FOUND', `条目 '${path}' 不存在。`);
  }
  return serializePresetPrompt(prompt.raw);
}

export async function writeCharacterBoundFile(path: string, content: string) {
  const binding = parseCharacterBinding(path);
  if (!binding) {
    throw new ToolError('ENTRY_NOT_FOUND', `路径 '${path}' 不存在。`);
  }
  switch (binding.kind) {
    case 'description': {
      const previous = await getCharacter(binding.characterName);
      await updateCharacterWith(binding.characterName, character => ({
        ...character,
        description: content,
      }));
      return {
        type: 'update' as const,
        warnings: [] as string[],
        originalContent: previous.description,
      };
    }
    case 'first_message': {
      const previous = await getCharacter(binding.characterName);
      const existed = binding.index < previous.first_messages.length;
      await updateCharacterWith(binding.characterName, character => {
        const next = structuredClone(character);
        while (next.first_messages.length <= binding.index) {
          next.first_messages.push('');
        }
        next.first_messages[binding.index] = content;
        return next;
      });
      return {
        type: existed ? ('update' as const) : ('create' as const),
        warnings: [] as string[],
        originalContent: existed ? previous.first_messages[binding.index] : null,
      };
    }
    case 'regex_file':
      return updateCharacterRegex(binding.characterName, binding.scriptName, content);
    case 'script_file':
      return updateCharacterScript(binding.characterName, binding.scriptName, content);
    default:
      throw new ToolError('InputValidationError', 'Write 只支持具体文件路径。', [invalidPathDetail(path)]);
  }
}

export async function writePresetBoundFile(path: string, content: string) {
  // 对外暴露的是单文件写入，底层仍通过整份 preset replace 回写。
  const binding = parsePresetBinding(path);
  if (!binding) {
    throw new ToolError('ENTRY_NOT_FOUND', `路径 '${path}' 不存在。`);
  }
  if (binding.kind !== 'preset_prompt') {
    throw new ToolError('InputValidationError', 'Write 只支持具体文件路径。', [invalidPathDetail(path)]);
  }
  return updatePresetPrompt(binding.presetName, binding.promptPath, content);
}

export async function deleteCharacterBoundFile(path: string) {
  const binding = parseCharacterBinding(path);
  if (!binding) {
    throw new ToolError('ENTRY_NOT_FOUND', `路径 '${path}' 不存在。`);
  }
  switch (binding.kind) {
    case 'first_message': {
      const previous = await getCharacter(binding.characterName);
      if (binding.index >= previous.first_messages.length) {
        throw new ToolError('ENTRY_NOT_FOUND', `条目 '${path}' 不存在。`);
      }
      await updateCharacterWith(binding.characterName, character => {
        const next = structuredClone(character);
        next.first_messages.splice(binding.index, 1);
        return next;
      });
      return;
    }
    case 'regex_file': {
      const view = await openCharacterView(binding.characterName);
      if (view.regexConflicts.has(binding.scriptName)) {
        throw new ToolError('PATH_CONFLICT', `Regex '${binding.scriptName}' 存在重名冲突。`);
      }
      if (!view.regexByName.has(binding.scriptName)) {
        throw new ToolError('ENTRY_NOT_FOUND', `条目 '${path}' 不存在。`);
      }
      await updateCharacterWith(binding.characterName, character => {
        const next = structuredClone(character);
        next.extensions.regex_scripts = (next.extensions.regex_scripts ?? []).filter(
          item => !tavernRegexSchema.safeParse(item).success || (item as TavernRegex).script_name !== binding.scriptName,
        );
        return next;
      });
      return;
    }
    case 'script_file': {
      const view = await openCharacterView(binding.characterName);
      if (view.scriptConflicts.has(binding.scriptName)) {
        throw new ToolError('PATH_CONFLICT', `Script '${binding.scriptName}' 存在重名冲突。`);
      }
      if (!view.scriptsByName.has(binding.scriptName)) {
        throw new ToolError('ENTRY_NOT_FOUND', `条目 '${path}' 不存在。`);
      }
      await updateCharacterWith(binding.characterName, character => {
        const next = structuredClone(character);
        next.extensions.tavern_helper = {
          ...(next.extensions.tavern_helper ?? { variables: {} }),
          scripts: (next.extensions.tavern_helper?.scripts ?? []).filter(
            item => !scriptSchema.safeParse(item).success || (item as Script).name !== binding.scriptName,
          ),
        };
        return next;
      });
      return;
    }
    default:
      throw new ToolError('InputValidationError', 'Delete 不支持此路径。', [invalidPathDetail(path)]);
  }
}

export async function deletePresetBoundFile(path: string) {
  // 删除时只从原数组里删掉对应 prompt，不做 prompts/prompts_unused 迁移。
  const binding = parsePresetBinding(path);
  if (!binding) {
    throw new ToolError('ENTRY_NOT_FOUND', `路径 '${path}' 不存在。`);
  }
  if (binding.kind !== 'preset_prompt') {
    throw new ToolError('InputValidationError', 'Delete 不支持此路径。', [invalidPathDetail(path)]);
  }

  const presetName = resolvePresetBindingPresetName(binding.presetName);
  const view = openPresetView(presetName);
  const actualFilePath = `${toPresetRootPath(presetName)}/${binding.promptPath}`;
  if (view.conflicts.has(actualFilePath)) {
    throw new ToolError('PATH_CONFLICT', `Prompt '${path}' 存在重名冲突。`);
  }
  const prompt = view.exactFiles.get(actualFilePath);
  if (!prompt) {
    throw new ToolError('ENTRY_NOT_FOUND', `条目 '${path}' 不存在。`);
  }

  const preset = structuredClone(getPreset(presetName));
  if (prompt.source === 'prompts') {
    preset.prompts = preset.prompts.filter(item => toPresetPromptFilePath(toPresetRootPath(presetName), item.name) !== actualFilePath);
  } else {
    preset.prompts_unused = preset.prompts_unused.filter(
      item => toPresetPromptFilePath(toPresetRootPath(presetName), item.name) !== actualFilePath,
    );
  }
  await replacePreset(presetName, preset, { render: 'debounced' });
}

export async function restoreDeletedCharacterFirstMessage(characterName: string, index: number, content: string) {
  await updateCharacterWith(characterName, character => {
    const next = structuredClone(character);
    while (next.first_messages.length < index) {
      next.first_messages.push('');
    }
    next.first_messages.splice(index, 0, content);
    return next;
  });
}

export async function resolveCharacterWriteCreateRollbackContext(path: string): Promise<
  | {
      strategy: 'restore_character_first_messages_length';
      characterName: string;
      previousLength: number;
    }
  | null
> {
  const binding = parseCharacterBinding(path);
  if (!binding || binding.kind !== 'first_message') {
    return null;
  }
  const character = await getCharacter(binding.characterName);
  return {
    strategy: 'restore_character_first_messages_length',
    characterName: binding.characterName,
    previousLength: character.first_messages.length,
  };
}

export async function restoreCharacterFirstMessagesLength(characterName: string, length: number) {
  await updateCharacterWith(characterName, character => {
    const next = structuredClone(character);
    next.first_messages = next.first_messages.slice(0, length);
    return next;
  });
}

export function resolveCharacterWorldbookTargetPath(view: CharacterView) {
  return view.worldbookTargetPath;
}

export function toCharacterDescriptionPath(characterName: string) {
  return `${CHARACTERS_ROOT_PATH}/${characterName}/Description.md`;
}

export async function resolveWorldbookBackedFileTarget(path: string): Promise<WorldbookBackedFileTarget | null> {
  const parsed = parseVirtualPath(path);
  if (parsed.rootKind === 'lorebook' && parsed.relativePath) {
    return {
      logicalPath: path,
      targetPath: path,
      worldbookName: parsed.entityName,
      entryPath: parsed.relativePath,
    };
  }
  if (parsed.rootKind !== 'character') {
    return null;
  }
  const binding = parseCharacterBinding(path);
  if (!binding || binding.kind !== 'worldbook_link' || !binding.remainder) {
    return null;
  }
  const view = await openCharacterView(binding.characterName);
  if (!view.worldbookTargetPath || !view.character.worldbook) {
    return null;
  }
  return {
    logicalPath: path,
    targetPath: `${view.worldbookTargetPath}/${binding.remainder}`,
    worldbookName: view.character.worldbook,
    entryPath: binding.remainder,
  };
}
