import { readAction } from '../src/wtc/actions/read';
import { resetPermissionCache } from '../src/wtc/permission';
import { buildBook, installMockSillyTavern } from './helpers/mock_sillytavern';
import { expectToolError } from './helpers/tool_assert';

afterEach(() => {
  resetPermissionCache();
});

describe('readAction', () => {
  test('reads an entry and returns normalized filePath with cat-style numbering', async () => {
    installMockSillyTavern({
      books: {
        设定集: buildBook([
          {
            uid: 1,
            comment: 'Folder/Content',
            content: '第一行\n第二行',
          },
        ]),
      },
    });

    const result = await readAction({
      file_path: '//Worldbooks///设定集///Folder/./Content',
    });

    expect(result).toStrictEqual({
      type: 'text',
      file: {
        filePath: '/Worldbooks/设定集/Folder/Content',
        content: '     1\t第一行\n     2\t第二行',
        numLines: 2,
        startLine: 1,
        totalLines: 2,
        hasMore: false,
        nextOffset: null,
      },
    });
  });

  test('supports offset and limit pagination', async () => {
    installMockSillyTavern({
      books: {
        设定集: buildBook([
          {
            uid: 1,
            comment: '章节/正文',
            content: '第1行\n第2行\n第3行\n第4行',
          },
        ]),
      },
    });

    const result = await readAction({
      file_path: '/Worldbooks/设定集/章节/正文',
      offset: 1,
      limit: 2,
    });

    expect(result).toStrictEqual({
      type: 'text',
      file: {
        filePath: '/Worldbooks/设定集/章节/正文',
        content: '     2\t第2行\n     3\t第3行',
        numLines: 2,
        startLine: 2,
        totalLines: 4,
        hasMore: true,
        nextOffset: 3,
      },
    });
  });

  test('automatically chunks long content and returns continuation metadata when limit is omitted', async () => {
    const firstLine = 'a'.repeat(3000);
    const secondLine = 'b'.repeat(3000);
    installMockSillyTavern({
      books: {
        设定集: buildBook([
          {
            uid: 1,
            comment: '长文',
            content: `${firstLine}\n${secondLine}\n结尾`,
          },
        ]),
      },
    });

    const first = await readAction({
      file_path: '/Worldbooks/设定集/长文',
    });

    expect(first.file).toStrictEqual({
      filePath: '/Worldbooks/设定集/长文',
      content: `     1\t${firstLine}`,
      numLines: 1,
      startLine: 1,
      totalLines: 3,
      hasMore: true,
      nextOffset: 1,
    });

    const second = await readAction({
      file_path: '/Worldbooks/设定集/长文',
      offset: first.file.nextOffset ?? 0,
    });

    expect(second.file.content).toBe(`     2\t${secondLine}\n     3\t结尾`);
    expect(second.file.hasMore).toBe(false);
    expect(second.file.nextOffset).toBeNull();
  });

  test('returns one complete oversized line so automatic chunking always makes progress', async () => {
    const oversizedLine = 'x'.repeat(6000);
    installMockSillyTavern({
      books: {
        设定集: buildBook([{ uid: 1, comment: '单行长文', content: `${oversizedLine}\n下一行` }]),
      },
    });

    const result = await readAction({
      file_path: '/Worldbooks/设定集/单行长文',
    });

    expect(result.file.content).toBe(`     1\t${oversizedLine}`);
    expect(result.file.hasMore).toBe(true);
    expect(result.file.nextOffset).toBe(1);
  });

  test('rejects worldbook root path as InputValidationError', async () => {
    installMockSillyTavern();

    const error = await expectToolError(
      readAction({
        file_path: '/Worldbooks/设定集',
      }),
    );

    expect(error.errorType).toBe('InputValidationError');
    expect(error.details).toStrictEqual([
      {
        expected: '合法的虚拟路径',
        received: '/Worldbooks/设定集',
        path: ['file_path'],
      },
    ]);
  });

  test('rejects negative offset with parameter details', async () => {
    installMockSillyTavern({
      books: {
        设定集: buildBook([
          {
            uid: 1,
            comment: '正文',
            content: 'A\nB',
          },
        ]),
      },
    });

    const error = await expectToolError(
      readAction({
        file_path: '/Worldbooks/设定集/正文',
        offset: -1,
      }),
    );

    expect(error.errorType).toBe('InputValidationError');
    expect(error.details).toStrictEqual([
      {
        expected: '大于等于 0 的整数',
        received: '-1',
        path: ['offset'],
      },
    ]);
  });

  test('rejects negative limit with parameter details', async () => {
    installMockSillyTavern({
      books: {
        设定集: buildBook([
          {
            uid: 1,
            comment: '正文',
            content: 'A\nB',
          },
        ]),
      },
    });

    const error = await expectToolError(
      readAction({
        file_path: '/Worldbooks/设定集/正文',
        limit: -1,
      }),
    );

    expect(error.errorType).toBe('InputValidationError');
    expect(error.details).toStrictEqual([
      {
        expected: '大于等于 0 的整数',
        received: '-1',
        path: ['limit'],
      },
    ]);
  });

  test('reports both offset and limit when both are negative', async () => {
    installMockSillyTavern({
      books: {
        设定集: buildBook([
          {
            uid: 1,
            comment: '正文',
            content: 'A\nB',
          },
        ]),
      },
    });

    const error = await expectToolError(
      readAction({
        file_path: '/Worldbooks/设定集/正文',
        offset: -1,
        limit: -2,
      }),
    );

    expect(error.errorType).toBe('InputValidationError');
    expect(error.details).toStrictEqual([
      {
        expected: '大于等于 0 的整数',
        received: '-1',
        path: ['offset'],
      },
      {
        expected: '大于等于 0 的整数',
        received: '-2',
        path: ['limit'],
      },
    ]);
  });

  test('returns ENTRY_NOT_FOUND when the entry does not exist', async () => {
    installMockSillyTavern({
      books: {
        设定集: buildBook([]),
      },
    });

    const error = await expectToolError(
      readAction({
        file_path: '/Worldbooks/设定集/不存在',
      }),
    );

    expect(error.errorType).toBe('ENTRY_NOT_FOUND');
  });

  test('reads character description files', async () => {
    installMockSillyTavern({
      characters: {
        Alice: {
          description: '角色描述',
        },
      },
    });

    const result = await readAction({
      file_path: '/Characters/Alice/Description.md',
    });

    expect(result).toStrictEqual({
      type: 'text',
      file: {
        filePath: '/Characters/Alice/Description.md',
        content: '     1\t角色描述',
        numLines: 1,
        startLine: 1,
        totalLines: 1,
        hasMore: false,
        nextOffset: null,
      },
    });
  });

  test('reads Regex files as full YFM text', async () => {
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
                  user_input: true,
                  ai_output: false,
                  slash_command: false,
                  world_info: false,
                  reasoning: false,
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

    const result = await readAction({
      file_path: '/Characters/Alice/Regex/Normalize',
    });

    expect(result.type).toBe('text');
    expect(result.file.filePath).toBe('/Characters/Alice/Regex/Normalize');
    expect(result.file.content).toContain('$schema: /Schemas/Regex.json');
    expect(result.file.content).toContain('find_regex: foo');
    expect(result.file.content).toContain('\tbar');
  });

  test('reads Script files as full YFM text', async () => {
    installMockSillyTavern({
      characters: {
        Alice: {
          extensions: {
            tavern_helper: {
              variables: {},
              scripts: [
                {
                  type: 'script',
                  enabled: true,
                  name: 'Setup',
                  id: 'script-1',
                  content: 'console.log("hello")',
                  info: 'bootstrap',
                  button: {
                    enabled: false,
                    buttons: [],
                  },
                  data: {},
                  export_with: {
                    data: false,
                    button: false,
                  },
                },
              ],
            },
          },
        },
      },
    });

    const result = await readAction({
      file_path: '/Characters/Alice/Scripts/Setup',
    });

    expect(result.type).toBe('text');
    expect(result.file.filePath).toBe('/Characters/Alice/Scripts/Setup');
    expect(result.file.content).toContain('$schema: /Schemas/Script.json');
    expect(result.file.content).toContain('info: bootstrap');
    expect(result.file.content).toContain('\tconsole.log("hello")');
  });

  test('reads worldbook files through character WorldBook alias', async () => {
    installMockSillyTavern({
      books: {
        设定集: buildBook([{ uid: 1, comment: '正文', content: '世界书内容' }]),
      },
      characters: {
        Alice: {
          worldbook: '设定集',
        },
      },
    });

    const result = await readAction({
      file_path: '/Characters/Alice/WorldBook/正文',
    });

    expect(result).toStrictEqual({
      type: 'text',
      file: {
        filePath: '/Characters/Alice/WorldBook/正文',
        content: '     1\t世界书内容',
        numLines: 1,
        startLine: 1,
        totalLines: 1,
        hasMore: false,
        nextOffset: null,
      },
    });
  });

  test('returns WORLD_NOT_FOUND when the lorebook does not exist', async () => {
    installMockSillyTavern({
      books: {
        其他设定: buildBook([]),
      },
    });

    const error = await expectToolError(
      readAction({
        file_path: '/Worldbooks/设定集/不存在',
      }),
    );

    expect(error.errorType).toBe('WORLD_NOT_FOUND');
  });

  test('returns PERMISSION_DENIED when user rejects read permission', async () => {
    const mock = installMockSillyTavern({
      books: {
        设定集: buildBook([
          {
            uid: 1,
            comment: '正文',
            content: '内容',
          },
        ]),
      },
      popupResult: false,
    });

    const error = await expectToolError(
      readAction({
        file_path: '/Worldbooks/设定集/正文',
      }),
    );

    expect(error.errorType).toBe('PERMISSION_DENIED');
    expect(mock.popupCalls).toHaveLength(1);
  });

  // 校验 Read 会把 preset prompt 作为普通文本文件输出，并保留 Current 逻辑路径。
  test('reads preset prompts through the Current alias as numbered YFM text', async () => {
    installMockSillyTavern({
      presets: {
        Alpha: {
          prompts: [
            {
              id: 'main',
              name: 'System/Main',
              enabled: true,
              position: { type: 'relative' },
              role: 'system',
              content: 'hello preset',
            },
          ],
        },
      },
      loadedPresetName: 'Alpha',
    });

    const result = await readAction({
      file_path: '/Presets/Current/System/Main',
    });

    expect(result.file.filePath).toBe('/Presets/Current/System/Main');
    expect(result.file.content).toContain('$schema: /Schemas/Preset.json');
    expect(result.file.content).toContain('hello preset');
  });
});
