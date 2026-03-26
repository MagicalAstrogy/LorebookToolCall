import {
  getSafeCharacterNames,
  getSafePresetNames,
  getSafeWorldbookNames,
  openCharacterView,
  openPresetView,
  parseCharacterBinding,
  parsePresetBinding,
  readCharacterBoundFile,
  readPresetBoundFile,
  resolveCharacterWriteCreateRollbackContext,
  resolvePermissionPresetName,
  resolveWorldbookBackedFileTarget,
  restoreCharacterFirstMessagesLength,
  restoreDeletedCharacterFirstMessage,
  serializePresetPrompt,
  serializeCharacterRegex,
  serializeCharacterScript,
  toCharacterDescriptionPath,
  writePresetBoundFile,
  writeCharacterBoundFile,
  deletePresetBoundFile,
  deleteCharacterBoundFile,
} from '../src/wtc/fs_bind';
import { resetPermissionCache } from '../src/wtc/permission';
import { buildBook, installMockSillyTavern } from './helpers/mock_sillytavern';
import { expectToolError } from './helpers/tool_assert';

afterEach(() => {
  resetPermissionCache();
});

describe('fs_bind helpers', () => {
  // 校验角色/世界书名称过滤，以及 CharacterView 对重名 regex/script 的冲突识别。
  test('filters safe entity names and builds character view indexes with conflicts', async () => {
    installMockSillyTavern({
      books: {
        Zebra: buildBook([]),
        Alpha: buildBook([]),
        '非法/名称': buildBook([]),
      },
      characters: {
        Zebra: {},
        Alpha: {
          worldbook: 'Alpha',
          extensions: {
            regex_scripts: [
              {
                id: 'regex-1',
                script_name: 'Normalize',
                enabled: true,
                find_regex: 'foo',
                replace_string: 'bar',
                trim_strings: [],
                source: {
                  user_input: false,
                  ai_output: true,
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
              },
              {
                id: 'regex-2',
                script_name: 'Normalize',
                enabled: true,
                find_regex: 'bar',
                replace_string: 'baz',
                trim_strings: [],
                source: {
                  user_input: false,
                  ai_output: true,
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
              },
              {
                id: 'regex-3',
                script_name: 'bad/name',
                enabled: true,
                find_regex: 'x',
                replace_string: 'y',
                trim_strings: [],
                source: {
                  user_input: false,
                  ai_output: true,
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
              },
            ],
            tavern_helper: {
              variables: {},
              scripts: [
                {
                  type: 'script',
                  enabled: true,
                  name: 'Setup',
                  id: 'script-1',
                  content: 'console.log(1)',
                  info: 'bootstrap',
                  button: {
                    enabled: false,
                    buttons: [],
                  },
                  data: {},
                },
                {
                  type: 'script',
                  enabled: true,
                  name: 'Setup',
                  id: 'script-2',
                  content: 'console.log(2)',
                  info: 'bootstrap',
                  button: {
                    enabled: false,
                    buttons: [],
                  },
                  data: {},
                },
                {
                  type: 'script',
                  enabled: true,
                  name: 'bad/name',
                  id: 'script-3',
                  content: 'console.log(3)',
                  info: 'bootstrap',
                  button: {
                    enabled: false,
                    buttons: [],
                  },
                  data: {},
                },
              ],
            },
          },
        },
        '非法/名称': {},
      },
    });

    expect(getSafeCharacterNames()).toStrictEqual(['Alpha', 'Zebra']);
    expect(getSafeWorldbookNames()).toStrictEqual(['Alpha', 'Zebra']);

    const view = await openCharacterView('Alpha');
    expect(view.worldbookTargetPath).toBe('/Worldbooks/Alpha');
    expect(view.regexByName.size).toBe(0);
    expect(view.regexConflicts.has('Normalize')).toBe(true);
    expect(view.regexConflicts.has('bad/name')).toBe(false);
    expect(view.scriptsByName.size).toBe(0);
    expect(view.scriptConflicts.has('Setup')).toBe(true);
    expect(view.scriptConflicts.has('bad/name')).toBe(false);
  });

  // 校验 preset 名过滤、getPreset 失败跳过，以及 prompt 路径冲突/目录占位冲突。
  test('filters safe preset names, skips unreadable presets and builds preset view indexes with conflicts', () => {
    installMockSillyTavern({
      presets: {
        Alpha: {
          prompts: [
            {
              id: 'a',
              name: 'Folder',
              enabled: true,
              position: { type: 'relative' },
              role: 'system',
              content: 'dir-shadowed',
            },
            {
              id: 'b',
              name: 'Folder/Child',
              enabled: true,
              position: { type: 'relative' },
              role: 'user',
              content: 'child',
            },
          ],
          prompts_unused: [
            {
              id: 'c',
              name: 'Duplicate',
              enabled: true,
              position: { type: 'relative' },
              role: 'assistant',
              content: 'one',
            },
            {
              id: 'd',
              name: 'Duplicate',
              enabled: true,
              position: { type: 'relative' },
              role: 'assistant',
              content: 'two',
            },
          ],
        },
        'bad/name': {},
      },
      loadedPresetName: 'Alpha',
    });
    (globalThis as any).getPresetNames = () => ['Alpha', 'bad/name', 'Broken'];
    (globalThis as any).getPreset = (name: string) => {
      if (name === 'Broken') {
        throw new Error('broken');
      }
      if (name === 'Alpha') {
        return {
          settings: {
            max_context: 8192,
            max_completion_tokens: 1024,
            reply_count: 1,
            should_stream: true,
            temperature: 1,
            frequency_penalty: 0,
            presence_penalty: 0,
            top_p: 1,
            repetition_penalty: 1,
            min_p: 0,
            top_k: 0,
            top_a: 0,
            seed: -1,
            squash_system_messages: false,
            reasoning_effort: 'auto',
            request_thoughts: false,
            request_images: false,
            enable_function_calling: true,
            enable_web_search: false,
            allow_sending_images: 'auto',
            allow_sending_videos: false,
            character_name_prefix: 'none',
            wrap_user_messages_in_quotes: false,
          },
          prompts: [
            { id: 'a', name: 'Folder', enabled: true, position: { type: 'relative' }, role: 'system', content: 'dir-shadowed' },
            { id: 'b', name: 'Folder/Child', enabled: true, position: { type: 'relative' }, role: 'user', content: 'child' },
          ],
          prompts_unused: [
            { id: 'c', name: 'Duplicate', enabled: true, position: { type: 'relative' }, role: 'assistant', content: 'one' },
            { id: 'd', name: 'Duplicate', enabled: true, position: { type: 'relative' }, role: 'assistant', content: 'two' },
          ],
          extensions: {
            regex_scripts: [],
            tavern_helper: { scripts: [], variales: {} },
          },
        } satisfies Preset;
      }
      throw new Error(`Preset '${name}' not found.`);
    };

    expect(getSafePresetNames()).toStrictEqual(['Alpha']);
    const view = openPresetView('Alpha');
    expect(view.conflicts.has('/Presets/Alpha/Duplicate')).toBe(true);
    expect(view.conflicts.has('/Presets/Alpha/Folder')).toBe(true);
    expect(view.exactFiles.has('/Presets/Alpha/Folder')).toBe(false);
  });

  // 校验 /Characters 下各类逻辑路径都能被解析到正确的绑定类型。
  test('parses character binding paths', () => {
    expect(parseCharacterBinding('/Worldbooks/设定集/正文')).toBeNull();
    expect(parseCharacterBinding('/Characters/Alice')).toStrictEqual({
      kind: 'character_root',
      characterName: 'Alice',
    });
    expect(parseCharacterBinding('/Characters/Alice/Description.md')).toStrictEqual({
      kind: 'description',
      characterName: 'Alice',
    });
    expect(parseCharacterBinding('/Characters/Alice/WorldBook')).toStrictEqual({
      kind: 'worldbook_link',
      characterName: 'Alice',
      remainder: null,
    });
    expect(parseCharacterBinding('/Characters/Alice/WorldBook/正文')).toStrictEqual({
      kind: 'worldbook_link',
      characterName: 'Alice',
      remainder: '正文',
    });
    expect(parseCharacterBinding('/Characters/Alice/FirstMessages')).toStrictEqual({
      kind: 'first_messages_dir',
      characterName: 'Alice',
    });
    expect(parseCharacterBinding('/Characters/Alice/FirstMessages/2')).toStrictEqual({
      kind: 'first_message',
      characterName: 'Alice',
      index: 2,
    });
    expect(parseCharacterBinding('/Characters/Alice/Regex')).toStrictEqual({
      kind: 'regex_dir',
      characterName: 'Alice',
    });
    expect(parseCharacterBinding('/Characters/Alice/Regex/Normalize')).toStrictEqual({
      kind: 'regex_file',
      characterName: 'Alice',
      scriptName: 'Normalize',
    });
    expect(parseCharacterBinding('/Characters/Alice/Scripts')).toStrictEqual({
      kind: 'scripts_dir',
      characterName: 'Alice',
    });
    expect(parseCharacterBinding('/Characters/Alice/Scripts/Setup')).toStrictEqual({
      kind: 'script_file',
      characterName: 'Alice',
      scriptName: 'Setup',
    });
    expect(parseCharacterBinding('/Characters/Alice/FirstMessages/not-number')).toBeNull();
    expect(parseCharacterBinding('/Characters/Alice/Regex/bad/name')).toBeNull();
  });

  // 校验 /Presets 路径会被正确拆成 preset 根目录或具体 prompt 文件。
  test('parses preset binding paths', () => {
    expect(parsePresetBinding('/Worldbooks/设定集/正文')).toBeNull();
    expect(parsePresetBinding('/Presets/Alpha')).toStrictEqual({
      kind: 'preset_root',
      presetName: 'Alpha',
    });
    expect(parsePresetBinding('/Presets/Alpha/System/Main')).toStrictEqual({
      kind: 'preset_prompt',
      presetName: 'Alpha',
      promptPath: 'System/Main',
    });
  });

  // 校验角色 Regex/Script 文件序列化时会带 schema front matter，并把正文单独输出。
  test('serializes regex and script files with schema front matter', () => {
    expect(
      serializeCharacterRegex({
        id: 'regex-1',
        script_name: 'Normalize',
        enabled: true,
        find_regex: 'foo',
        replace_string: 'bar',
        trim_strings: [],
        source: {
          user_input: false,
          ai_output: true,
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
      }),
    ).toContain('$schema: /Schemas/Regex.json');
    expect(
      serializeCharacterScript({
        type: 'script',
        enabled: true,
        name: 'Setup',
        id: 'script-1',
        content: 'console.log(1)',
        info: 'bootstrap',
        button: {
          enabled: false,
          buttons: [],
        },
        data: {},
      }),
    ).toContain('$schema: /Schemas/Script.json');
    expect(
      serializePresetPrompt({
        id: 'main',
        name: 'System/Main',
        enabled: true,
        position: { type: 'relative' },
        role: 'system',
        content: 'hello',
        extra: {},
      }),
    ).toContain('$schema: /Schemas/Preset.json');
  });

  // 校验 Character 绑定文件的基础读写删流程，尤其是 FirstMessages 的补空与删除收缩。
  test('reads, writes and deletes bound character files', async () => {
    const mock = installMockSillyTavern({
      characters: {
        Alice: {
          description: '原描述',
          first_messages: ['hello'],
          extensions: {
            regex_scripts: [
              {
                id: 'regex-1',
                script_name: 'Normalize',
                enabled: true,
                find_regex: 'foo',
                replace_string: 'bar',
                trim_strings: [],
                source: {
                  user_input: false,
                  ai_output: true,
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
              },
            ],
            tavern_helper: {
              variables: {},
              scripts: [
                {
                  type: 'script',
                  enabled: true,
                  name: 'Setup',
                  id: 'script-1',
                  content: 'console.log(1)',
                  info: 'bootstrap',
                  button: {
                    enabled: false,
                    buttons: [],
                  },
                  data: {},
                },
              ],
            },
          },
        },
      },
    });

    expect(await readCharacterBoundFile('/Characters/Alice/Description.md')).toBe('原描述');
    expect(await readCharacterBoundFile('/Characters/Alice/FirstMessages/0')).toBe('hello');
    expect(await readCharacterBoundFile('/Characters/Alice/Regex/Normalize')).toContain('$schema: /Schemas/Regex.json');
    expect(await readCharacterBoundFile('/Characters/Alice/Regex/Normalize')).toContain('\n---\nbar');
    expect(await readCharacterBoundFile('/Characters/Alice/Scripts/Setup')).toContain('console.log(1)');

    await expect(writeCharacterBoundFile('/Characters/Alice/FirstMessages/2', 'tail')).resolves.toStrictEqual({
      type: 'create',
      warnings: [],
      originalContent: null,
    });
    expect(mock.characters.get('Alice')?.first_messages).toStrictEqual(['hello', '', 'tail']);

    await expect(deleteCharacterBoundFile('/Characters/Alice/FirstMessages/1')).resolves.toBeUndefined();
    expect(mock.characters.get('Alice')?.first_messages).toStrictEqual(['hello', 'tail']);
  });

  // 校验目录误读、Regex 重名冲突、非法 front matter、缺失条目等错误分支。
  test('reports errors for invalid character-bound reads and writes', async () => {
    installMockSillyTavern({
      characters: {
        Alice: {
          extensions: {
            regex_scripts: [
              {
                id: 'regex-1',
                script_name: 'Normalize',
                enabled: true,
                find_regex: 'foo',
                replace_string: 'bar',
                trim_strings: [],
                source: {
                  user_input: false,
                  ai_output: true,
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
              },
              {
                id: 'regex-2',
                script_name: 'Normalize',
                enabled: true,
                find_regex: 'bar',
                replace_string: 'baz',
                trim_strings: [],
                source: {
                  user_input: false,
                  ai_output: true,
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
              },
            ],
          },
        },
      },
    });

    const directoryError = await expectToolError(readCharacterBoundFile('/Characters/Alice/Regex'));
    expect(directoryError.errorType).toBe('InputValidationError');

    const conflictError = await expectToolError(readCharacterBoundFile('/Characters/Alice/Regex/Normalize'));
    expect(conflictError.errorType).toBe('PATH_CONFLICT');

    const writeError = await expectToolError(
      writeCharacterBoundFile('/Characters/Alice/Regex/NewOne', ['---', 'enabled: nope', '---', 'body'].join('\n')),
    );
    expect(writeError.errorType).toBe('InputValidationError');

    const deleteError = await expectToolError(deleteCharacterBoundFile('/Characters/Alice/FirstMessages/99'));
    expect(deleteError.errorType).toBe('ENTRY_NOT_FOUND');
  });

  // 校验 preset 绑定层的读写删，以及 Current alias 会正确折算到真实 preset。
  test('reads, writes and deletes preset-bound files, including Current alias', async () => {
    const mock = installMockSillyTavern({
      presets: {
        Alpha: {
          prompts: [
            {
              id: 'main',
              name: 'System/Main',
              enabled: true,
              position: { type: 'relative' },
              role: 'system',
              content: 'main body',
            },
          ],
          prompts_unused: [
            {
              id: 'side',
              name: 'Unused/Note',
              enabled: false,
              position: { type: 'relative' },
              role: 'user',
              content: 'unused body',
            },
          ],
        },
      },
      loadedPresetName: 'Alpha',
    });

    expect(await readPresetBoundFile('/Presets/Alpha/System/Main')).toContain('$schema: /Schemas/Preset.json');
    expect(await readPresetBoundFile('/Presets/Current/System/Main')).toContain('main body');
    expect(resolvePermissionPresetName('/Presets/Current/System/Main')).toBe('Alpha');

    await expect(writePresetBoundFile('/Presets/Alpha/New/Prompt', 'body only')).resolves.toMatchObject({
      mode: 'create',
      warnings: [],
      originalContent: null,
    });
    expect(mock.presets.get('Alpha')?.prompts.some(prompt => prompt.name === 'New/Prompt')).toBe(true);

    await expect(
      writePresetBoundFile(
        '/Presets/Current/System/Main',
        ['---', '$schema: /Schemas/Preset.json', 'id: main', 'enabled: false', 'position:', '  type: relative', 'role: system', '---', 'updated'].join(
          '\n',
        ),
      ),
    ).resolves.toMatchObject({
      mode: 'update',
    });
    expect(mock.presets.get('Alpha')?.prompts.find(prompt => prompt.name === 'System/Main')).toMatchObject({
      name: 'System/Main',
      content: 'updated',
      enabled: false,
    });

    await expect(deletePresetBoundFile('/Presets/Alpha/Unused/Note')).resolves.toBeUndefined();
    expect(mock.presets.get('Alpha')?.prompts_unused).toStrictEqual([]);
  });

  // 校验真实 preset 名与保留别名 Current 冲突时，会统一返回 PATH_CONFLICT。
  test('treats real preset name Current as path conflict', async () => {
    installMockSillyTavern({
      presets: {
        Current: {
          prompts: [
            {
              id: 'main',
              name: 'Prompt',
              enabled: true,
              position: { type: 'relative' },
              role: 'system',
              content: 'x',
            },
          ],
        },
      },
      loadedPresetName: 'Current',
    });

    const error = await expectToolError(readPresetBoundFile('/Presets/Current/Prompt'));
    expect(error.errorType).toBe('PATH_CONFLICT');
  });

  // 校验 FirstMessages 的两类回滚辅助：恢复删除项、回退创建导致的尾部扩容。
  test('restores deleted first messages and trims created tails for rollback', async () => {
    const mock = installMockSillyTavern({
      characters: {
        Alice: {
          first_messages: ['zero', 'two'],
        },
      },
    });

    expect(await resolveCharacterWriteCreateRollbackContext('/Characters/Alice/Description.md')).toBeNull();
    expect(await resolveCharacterWriteCreateRollbackContext('/Characters/Alice/FirstMessages/5')).toStrictEqual({
      strategy: 'restore_character_first_messages_length',
      characterName: 'Alice',
      previousLength: 2,
    });

    await restoreDeletedCharacterFirstMessage('Alice', 1, 'one');
    expect(mock.characters.get('Alice')?.first_messages).toStrictEqual(['zero', 'one', 'two']);

    await restoreCharacterFirstMessagesLength('Alice', 2);
    expect(mock.characters.get('Alice')?.first_messages).toStrictEqual(['zero', 'one']);
  });

  // 校验 WorldBook alias 和直接 Worldbooks 路径都能正确映射到真实目标。
  test('resolves worldbook-backed file targets and description paths', async () => {
    installMockSillyTavern({
      books: {
        设定集: buildBook([{ uid: 1, comment: '正文', content: 'abc' }]),
      },
      characters: {
        Alice: {
          worldbook: '设定集',
        },
        Bob: {
          worldbook: null,
        },
      },
    });

    expect(toCharacterDescriptionPath('Alice')).toBe('/Characters/Alice/Description.md');
    await expect(resolveWorldbookBackedFileTarget('/Worldbooks/设定集/正文')).resolves.toStrictEqual({
      logicalPath: '/Worldbooks/设定集/正文',
      targetPath: '/Worldbooks/设定集/正文',
      worldbookName: '设定集',
      entryPath: '正文',
    });
    await expect(resolveWorldbookBackedFileTarget('/Characters/Alice/WorldBook/正文')).resolves.toStrictEqual({
      logicalPath: '/Characters/Alice/WorldBook/正文',
      targetPath: '/Worldbooks/设定集/正文',
      worldbookName: '设定集',
      entryPath: '正文',
    });
    await expect(resolveWorldbookBackedFileTarget('/Characters/Alice/WorldBook')).resolves.toBeNull();
    await expect(resolveWorldbookBackedFileTarget('/Characters/Bob/WorldBook/正文')).resolves.toBeNull();
    await expect(resolveWorldbookBackedFileTarget('/Schemas/Regex.json')).resolves.toBeNull();
  });
});
