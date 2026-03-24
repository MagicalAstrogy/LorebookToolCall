import { editAction, editRollback } from '../src/wtc/actions/edit';
import { resetPermissionCache } from '../src/wtc/permission';
import { buildBook, installMockSillyTavern } from './helpers/mock_sillytavern';
import { expectToolError } from './helpers/tool_assert';

afterEach(() => {
  resetPermissionCache();
});

describe('editAction', () => {
  test('replaces a single match and returns edit metadata', async () => {
    installMockSillyTavern({
      books: {
        设定集: buildBook([{ uid: 1, comment: '正文', content: 'hello world' }]),
      },
    });

    const result = await editAction({
      file_path: '/Worldbooks/设定集/正文',
      old_string: 'world',
      new_string: 'jest',
    });

    expect(result).toMatchObject({
      filePath: '/Worldbooks/设定集/正文',
      oldString: 'world',
      newString: 'jest',
      originalFile: 'hello world',
      userModified: false,
      replaceAll: false,
    });
    expect(result.backup).toMatchObject({
      rollbackMethod: 'editRollback',
      filePath: '/Worldbooks/设定集/正文',
      originalContent: 'hello world',
    });
    expect(result.originalFileNotice).toBeUndefined();
    expect(result.structuredPatch).toHaveLength(1);
  });

  test('rejects ambiguous replacement unless replace_all is true', async () => {
    installMockSillyTavern({
      books: {
        设定集: buildBook([{ uid: 1, comment: '正文', content: 'x hello x hello' }]),
      },
    });

    const error = await expectToolError(
      editAction({
        file_path: '/Worldbooks/设定集/正文',
        old_string: 'hello',
        new_string: 'hi',
      }),
    );

    expect(error.errorType).toBe('InputValidationError');
    expect(error.details?.[0]?.path).toStrictEqual(['replace_all']);
  });

  test('returns TEXT_NOT_FOUND when old_string is missing', async () => {
    installMockSillyTavern({
      books: {
        设定集: buildBook([{ uid: 1, comment: '正文', content: 'abc' }]),
      },
    });

    const error = await expectToolError(
      editAction({
        file_path: '/Worldbooks/设定集/正文',
        old_string: 'zzz',
        new_string: 'hi',
      }),
    );

    expect(error.errorType).toBe('TEXT_NOT_FOUND');
  });

  test('omits originalFile and returns a notice when original content is too large', async () => {
    const oversizedContent = `${'a\n'.repeat(2500)}TAIL`;
    installMockSillyTavern({
      books: {
        设定集: buildBook([{ uid: 1, comment: '正文', content: oversizedContent }]),
      },
    });

    const result = await editAction({
      file_path: '/Worldbooks/设定集/正文',
      old_string: 'TAIL',
      new_string: 'DONE',
    });

    expect(result.originalFile).toBeNull();
    expect(result.originalFileNotice).toMatch(/5000 字符/);
    expect(result.structuredPatch).toHaveLength(1);
  });

  test('rolls back edited content using backup', async () => {
    const mock = installMockSillyTavern({
      books: {
        设定集: buildBook([{ uid: 1, comment: '正文', content: 'hello world' }]),
      },
    });

    const result = await editAction({
      file_path: '/Worldbooks/设定集/正文',
      old_string: 'world',
      new_string: 'jest',
    });
    await editRollback(result.backup);

    expect(mock.worldbooks.get('设定集')?.[0]?.content).toBe('hello world');
  });

  test('edits character Regex files against the mapped YFM text', async () => {
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
                replace_string: 'bar',
                trim_strings: [],
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
                run_on_edit: false,
                min_depth: null,
                max_depth: null,
              },
            ],
          },
        },
      },
    });

    const result = await editAction({
      file_path: '/Characters/Alice/Regex/Normalize',
      old_string: 'find_regex: foo',
      new_string: 'find_regex: baz',
    });

    expect(result.filePath).toBe('/Characters/Alice/Regex/Normalize');
    expect(result.originalFile).toContain('find_regex: foo');
    expect(mock.characters.get('Alice')?.extensions.regex_scripts?.[0]).toMatchObject({
      script_name: 'Normalize',
      find_regex: 'baz',
      replace_string: 'bar',
    });

    await editRollback(result.backup);
    expect(mock.characters.get('Alice')?.extensions.regex_scripts?.[0]).toMatchObject({
      script_name: 'Normalize',
      find_regex: 'foo',
      replace_string: 'bar',
    });
  });
});
