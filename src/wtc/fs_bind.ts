import YAML from 'yaml';
import { z } from 'zod';
import { ToolError, invalidPathDetail } from '@/wtc/result';
import {
  CHARACTERS_ROOT_PATH,
  isSafeSinglePathSegment,
  parseVirtualPath,
  toCharacterRootPath,
  toLorebookRootPath,
} from '@/wtc/store';

type RegexIndexBuildResult = {
  byName: Map<string, TavernRegex>;
  conflicts: Set<string>;
};

type ScriptIndexBuildResult = {
  byName: Map<string, Script>;
  conflicts: Set<string>;
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

export interface CharacterView {
  characterName: string;
  character: Character;
  worldbookTargetPath: string | null;
  regexByName: Map<string, TavernRegex>;
  regexConflicts: Set<string>;
  scriptsByName: Map<string, Script>;
  scriptConflicts: Set<string>;
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

export const tavernRegexSchema = z
  .object({
    id: z.string(),
    script_name: z.string(),
    enabled: z.boolean(),
    scope: z.enum(['global', 'character']).optional(),
    find_regex: z.string(),
    replace_string: z.string(),
    trim_strings: tavernRegexTrimStringsSchema,
    source: z.object({
      user_input: z.boolean(),
      ai_output: z.boolean(),
      slash_command: z.boolean(),
      world_info: z.boolean(),
    }),
    destination: z.object({
      display: z.boolean(),
      prompt: z.boolean(),
    }),
    run_on_edit: z.boolean(),
    min_depth: z.number().int().nullable(),
    max_depth: z.number().int().nullable(),
  })
  .strict();

export const tavernRegexFrontMatterSchema = tavernRegexSchema.omit({
  script_name: true,
  replace_string: true,
});

export const scriptSchema = z
  .object({
    type: z.literal('script'),
    enabled: z.boolean(),
    name: z.string(),
    id: z.string(),
    content: z.string(),
    info: z.string(),
    button: z.object({
      enabled: z.boolean(),
      buttons: z.array(
        z.object({
          name: z.string(),
          visible: z.boolean(),
        }),
      ),
    }),
    data: z.record(z.string(), z.any()),
  })
  .strict();

export const scriptFrontMatterSchema = scriptSchema.omit({
  name: true,
  content: true,
});

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

export function serializeCharacterRegex(regex: TavernRegex) {
  const { script_name: _scriptName, replace_string, ...frontMatter } = regex;
  return stringifyFrontMatter(frontMatter, replace_string);
}

export function serializeCharacterScript(script: Script) {
  const { name: _name, content, ...frontMatter } = script;
  return stringifyFrontMatter(frontMatter, content);
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
        ...parsed.frontMatter,
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
    const frontMatter = parsed.kind === 'missing' ? createDefaultCharacterRegexFrontMatter() : parsed.frontMatter;
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
        ...parsed.frontMatter,
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
    const frontMatter = parsed.kind === 'missing' ? createDefaultCharacterScriptFrontMatter() : parsed.frontMatter;
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
