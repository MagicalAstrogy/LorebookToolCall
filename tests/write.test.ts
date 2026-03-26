import { writeAction, writeRollback } from '../src/wtc/actions/write';
import { resetPermissionCache } from '../src/wtc/permission';
import { buildBook, installMockSillyTavern } from './helpers/mock_sillytavern';
import { expectToolError } from './helpers/tool_assert';

afterEach(() => {
  resetPermissionCache();
});

describe('writeAction', () => {
  test('creates a new entry and writes normalized comment path', async () => {
    const mock = installMockSillyTavern({
      books: {
        设定集: buildBook([]),
      },
    });

    const result = await writeAction({
      file_path: '//Worldbooks///设定集///新建/条目',
      content: '新内容',
    });

    expect(result).toStrictEqual({
      type: 'create',
      filePath: '/Worldbooks/设定集/新建/条目',
      content: '新内容',
      structuredPatch: [],
      originalFile: null,
      backup: {
        rollbackMethod: 'writeRollback',
        mode: 'create',
        filePath: '/Worldbooks/设定集/新建/条目',
        strategy: 'delete',
      },
    });
    expect(mock.rawBooks.get('设定集')?.entries[0]?.comment).toBe('新建/条目');
  });

  test('updates an existing entry and returns originalFile plus patch', async () => {
    installMockSillyTavern({
      books: {
        设定集: buildBook([{ uid: 1, comment: '正文', content: '旧文本' }]),
      },
    });

    const result = await writeAction({
      file_path: '/Worldbooks/设定集/正文',
      content: '新文本',
    });

    expect(result.type).toBe('update');
    expect(result.filePath).toBe('/Worldbooks/设定集/正文');
    expect(result.originalFile).toBe('旧文本');
    expect(result.content).toBe('新文本');
    expect(result.backup).toMatchObject({
      rollbackMethod: 'writeRollback',
      mode: 'update',
      filePath: '/Worldbooks/设定集/正文',
      originalContent: '旧文本',
    });
    expect(result.structuredPatch).toHaveLength(1);
  });

  test('rolls back a created entry using backup', async () => {
    const mock = installMockSillyTavern({
      books: {
        设定集: buildBook([]),
      },
    });

    const result = await writeAction({
      file_path: '/Worldbooks/设定集/新建条目',
      content: '新内容',
    });
    await writeRollback(result.backup);

    expect(mock.rawBooks.get('设定集')?.entries).toStrictEqual([]);
  });

  test('rolls back an updated entry using backup', async () => {
    const mock = installMockSillyTavern({
      books: {
        设定集: buildBook([{ uid: 1, comment: '正文', content: '旧文本' }]),
      },
    });

    const result = await writeAction({
      file_path: '/Worldbooks/设定集/正文',
      content: '新文本',
    });
    await writeRollback(result.backup);

    expect(mock.worldbooks.get('设定集')?.[0]?.content).toBe('旧文本');
  });

  test('rolls back a created character first message to the original array length', async () => {
    const mock = installMockSillyTavern({
      characters: {
        Alice: {
          first_messages: ['已有'],
        },
      },
    });

    const result = await writeAction({
      file_path: '/Characters/Alice/FirstMessages/3',
      content: '新内容',
    });

    expect(mock.characters.get('Alice')?.first_messages).toStrictEqual(['已有', '', '', '新内容']);
    await writeRollback(result.backup);
    expect(mock.characters.get('Alice')?.first_messages).toStrictEqual(['已有']);
  });

  test('rejects worldbook root path', async () => {
    installMockSillyTavern({
      books: {
        设定集: buildBook([]),
      },
    });

    const error = await expectToolError(writeAction({ file_path: '/Worldbooks/设定集', content: 'x' }));

    expect(error.errorType).toBe('InputValidationError');
  });

  test('writes worldbook entries through character WorldBook alias while preserving logical path', async () => {
    const mock = installMockSillyTavern({
      books: {
        设定集: buildBook([{ uid: 1, comment: '正文', content: '旧文本' }]),
      },
      characters: {
        Alice: {
          worldbook: '设定集',
        },
      },
    });

    const result = await writeAction({
      file_path: '/Characters/Alice/WorldBook/正文',
      content: '新文本',
    });

    expect(result).toMatchObject({
      type: 'update',
      filePath: '/Characters/Alice/WorldBook/正文',
      originalFile: '旧文本',
      backup: {
        rollbackMethod: 'writeRollback',
        mode: 'update',
        filePath: '/Characters/Alice/WorldBook/正文',
        originalContent: '旧文本',
      },
    });
    expect(mock.worldbooks.get('设定集')?.[0]?.content).toBe('新文本');

    await writeRollback(result.backup);
    expect(mock.worldbooks.get('设定集')?.[0]?.content).toBe('旧文本');
  });

  test('creates Regex files without front matter by filling default fields', async () => {
    const mock = installMockSillyTavern({
      characters: {
        Alice: {},
      },
    });

    const result = await writeAction({
      file_path: '/Characters/Alice/Regex/Normalize',
      content: 'body only',
    });

    expect(result.type).toBe('create');
    expect(result.filePath).toBe('/Characters/Alice/Regex/Normalize');
    expect(result.warnings).toBeUndefined();
    expect(mock.characters.get('Alice')?.extensions.regex_scripts).toHaveLength(1);
    expect(mock.characters.get('Alice')?.extensions.regex_scripts?.[0]).toMatchObject({
      script_name: 'Normalize',
      replace_string: 'body only',
      enabled: true,
      find_regex: '',
      trim_strings: [],
      run_on_edit: false,
    });
  });

  test('updates Regex files without front matter and preserves previous attributes with warning', async () => {
    const mock = installMockSillyTavern({
      characters: {
        Alice: {
          extensions: {
            regex_scripts: [
              {
                id: 'regex-1',
                script_name: 'Normalize',
                enabled: false,
                find_regex: 'foo',
                replace_string: 'old body',
                trim_strings: [' '],
                source: {
                  user_input: true,
                  ai_output: false,
                  slash_command: false,
                  world_info: false,
                },
                destination: {
                  display: true,
                  prompt: false,
                },
                run_on_edit: true,
                min_depth: 1,
                max_depth: 2,
              },
            ],
          },
        },
      },
    });

    const result = await writeAction({
      file_path: '/Characters/Alice/Regex/Normalize',
      content: 'new body only',
    });

    expect(result.type).toBe('update');
    expect(result.warnings).toStrictEqual(['Front Matter Missing']);
    expect(mock.characters.get('Alice')?.extensions.regex_scripts?.[0]).toMatchObject({
      script_name: 'Normalize',
      replace_string: 'new body only',
      enabled: false,
      find_regex: 'foo',
      trim_strings: [' '],
      run_on_edit: true,
      min_depth: 1,
      max_depth: 2,
    });
  });

  test('creates Regex files with array trim_strings in front matter', async () => {
    const mock = installMockSillyTavern({
      characters: {
        Alice: {},
      },
    });

    const result = await writeAction({
      file_path: '/Characters/Alice/Regex/Normalize',
      content: [
        '---',
        '$schema: /Schemas/Regex.json',
        'id: regex-1',
        'enabled: true',
        'find_regex: foo',
        'trim_strings: []',
        'source:',
        '  user_input: false',
        '  ai_output: true',
        '  slash_command: false',
        '  world_info: false',
        'destination:',
        '  display: true',
        '  prompt: true',
        'run_on_edit: true',
        'min_depth: null',
        'max_depth: null',
        '---',
        'bar',
      ].join('\n'),
    });

    expect(result.type).toBe('create');
    expect(mock.characters.get('Alice')?.extensions.regex_scripts?.[0]).toMatchObject({
      script_name: 'Normalize',
      replace_string: 'bar',
      trim_strings: [],
    });
    expect(mock.characters.get('Alice')?.extensions.regex_scripts?.[0]).not.toHaveProperty('$schema');
  });

  test('creates Script files with $schema in front matter', async () => {
    const mock = installMockSillyTavern({
      characters: {
        Alice: {},
      },
    });

    const result = await writeAction({
      file_path: '/Characters/Alice/Scripts/Setup',
      content: [
        '---',
        '$schema: /Schemas/Script.json',
        'type: script',
        'enabled: true',
        'id: script-1',
        'info: bootstrap',
        'button:',
        '  enabled: false',
        '  buttons: []',
        'data: {}',
        '---',
        'console.log(1)',
      ].join('\n'),
    });

    expect(result.type).toBe('create');
    expect(mock.characters.get('Alice')?.extensions.tavern_helper?.scripts?.[0]).toMatchObject({
      type: 'script',
      name: 'Setup',
      content: 'console.log(1)',
      enabled: true,
      id: 'script-1',
      info: 'bootstrap',
    });
    expect(mock.characters.get('Alice')?.extensions.tavern_helper?.scripts?.[0]).not.toHaveProperty('$schema');
  });

  test('normalizes legacy string trim_strings into array on update', async () => {
    const mock = installMockSillyTavern({
      characters: {
        Alice: {
          extensions: {
            regex_scripts: [
              {
                id: 'regex-1',
                script_name: 'Normalize',
                enabled: true,
                find_regex: 'foo',
                replace_string: 'old body',
                trim_strings: ' ',
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
              } as unknown as TavernRegex,
            ],
          },
        },
      },
    });

    const result = await writeAction({
      file_path: '/Characters/Alice/Regex/Normalize',
      content: 'new body only',
    });

    expect(result.type).toBe('update');
    expect(mock.characters.get('Alice')?.extensions.regex_scripts?.[0]).toMatchObject({
      script_name: 'Normalize',
      replace_string: 'new body only',
      trim_strings: [' '],
    });
  });

  test('rejects invalid Regex front matter during create', async () => {
    installMockSillyTavern({
      characters: {
        Alice: {},
      },
    });

    const error = await expectToolError(
      writeAction({
        file_path: '/Characters/Alice/Regex/Normalize',
        content: ['---', 'enabled: nope', '---', 'body'].join('\n'),
      }),
    );

    expect(error.errorType).toBe('InputValidationError');
    expect(error.message).toMatch(/Regex Front Matter 不合法/);
  });

  test('creates Script files without front matter by filling default fields', async () => {
    const mock = installMockSillyTavern({
      characters: {
        Alice: {},
      },
    });

    const result = await writeAction({
      file_path: '/Characters/Alice/Scripts/Setup',
      content: 'console.log(1)',
    });

    expect(result.type).toBe('create');
    expect(result.warnings).toBeUndefined();
    expect(mock.characters.get('Alice')?.extensions.tavern_helper?.scripts).toHaveLength(1);
    expect(mock.characters.get('Alice')?.extensions.tavern_helper?.scripts?.[0]).toMatchObject({
      type: 'script',
      name: 'Setup',
      content: 'console.log(1)',
      enabled: true,
      info: '',
    });
  });

  test('rejects invalid Script front matter during create', async () => {
    installMockSillyTavern({
      characters: {
        Alice: {},
      },
    });

    const error = await expectToolError(
      writeAction({
        file_path: '/Characters/Alice/Scripts/Setup',
        content: ['---', 'enabled: nope', '---', 'console.log(1)'].join('\n'),
      }),
    );

    expect(error.errorType).toBe('InputValidationError');
    expect(error.message).toMatch(/Script Front Matter 不合法/);
  });

  test('updates Script files with invalid front matter and falls back to previous attributes', async () => {
    const mock = installMockSillyTavern({
      characters: {
        Alice: {
          extensions: {
            tavern_helper: {
              variables: {},
              scripts: [
                {
                  type: 'script',
                  enabled: false,
                  name: 'Setup',
                  id: 'script-1',
                  content: 'old content',
                  info: 'bootstrap',
                  button: {
                    enabled: true,
                    buttons: [{ name: 'Run', visible: true }],
                  },
                  data: { foo: 'bar' },
                },
              ],
            },
          },
        },
      },
    });

    const result = await writeAction({
      file_path: '/Characters/Alice/Scripts/Setup',
      content: ['---', 'enabled: nope', '---', 'new content'].join('\n'),
    });

    expect(result.type).toBe('update');
    expect(result.warnings).toStrictEqual(['Invalid Front Matter,Ignored']);
    expect(mock.characters.get('Alice')?.extensions.tavern_helper?.scripts?.[0]).toMatchObject({
      type: 'script',
      enabled: false,
      name: 'Setup',
      content: 'new content',
      info: 'bootstrap',
      button: {
        enabled: true,
        buttons: [{ name: 'Run', visible: true }],
      },
      data: { foo: 'bar' },
    });
  });

  // 校验 /Presets 写入会创建 prompt，并且沿用通用 writeRollback 的 delete 备份策略。
  test('creates preset prompts under /Presets and rolls back via delete backup', async () => {
    const mock = installMockSillyTavern({
      presets: {
        Alpha: {},
      },
      loadedPresetName: 'Alpha',
    });

    const result = await writeAction({
      file_path: '/Presets/Alpha/New/Prompt',
      content: 'preset body',
    });

    expect(result).toMatchObject({
      type: 'create',
      filePath: '/Presets/Alpha/New/Prompt',
      originalFile: null,
      backup: {
        rollbackMethod: 'writeRollback',
        mode: 'create',
        filePath: '/Presets/Alpha/New/Prompt',
        strategy: 'delete',
      },
    });
    expect(mock.presets.get('Alpha')?.prompts.find(prompt => prompt.name === 'New/Prompt')).toMatchObject({
      content: 'preset body',
    });

    await writeRollback(result.backup);
    expect(mock.presets.get('Alpha')?.prompts.find(prompt => prompt.name === 'New/Prompt')).toBeUndefined();
  });
});
