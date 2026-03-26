import {
  getSafeCharacterNames,
  getSafeWorldbookNames,
  openCharacterView,
  parseCharacterBinding,
  readCharacterBoundFile,
  resolveCharacterWriteCreateRollbackContext,
  resolveWorldbookBackedFileTarget,
  restoreCharacterFirstMessagesLength,
  restoreDeletedCharacterFirstMessage,
  serializeCharacterRegex,
  serializeCharacterScript,
  toCharacterDescriptionPath,
  writeCharacterBoundFile,
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
