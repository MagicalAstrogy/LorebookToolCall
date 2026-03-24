import { deleteAction, deleteRollback } from '../src/wtc/actions/delete';
import { resetPermissionCache } from '../src/wtc/permission';
import { buildBook, installMockSillyTavern } from './helpers/mock_sillytavern';
import { expectToolError } from './helpers/tool_assert';

afterEach(() => {
  resetPermissionCache();
});

describe('deleteAction', () => {
  test('deletes a concrete entry', async () => {
    const mock = installMockSillyTavern({
      books: {
        设定集: buildBook([{ uid: 1, comment: '正文', content: 'abc' }]),
      },
    });

    const result = await deleteAction({ file_path: '/Worldbooks/设定集/正文' });

    expect(result).toMatchObject({
      filePath: '/Worldbooks/设定集/正文',
      deleted: true,
      backup: {
        rollbackMethod: 'deleteRollback',
        strategy: 'write',
        filePath: '/Worldbooks/设定集/正文',
        content: 'abc',
      },
    });
    expect(mock.rawBooks.get('设定集')?.entries).toHaveLength(0);
  });

  test('rolls back a deleted worldbook entry', async () => {
    const mock = installMockSillyTavern({
      books: {
        设定集: buildBook([{ uid: 1, comment: '正文', content: 'abc', attributes: { enabled: false, probability: 25 } }]),
      },
    });

    const result = await deleteAction({ file_path: '/Worldbooks/设定集/正文' });
    await deleteRollback(result.backup);

    expect(mock.worldbooks.get('设定集')).toHaveLength(1);
    expect(mock.worldbooks.get('设定集')?.[0]).toMatchObject({
      content: 'abc',
      enabled: false,
      probability: 25,
    });
    expect(mock.rawBooks.get('设定集')?.entries[0]).toMatchObject({
      comment: '正文',
      content: 'abc',
    });
  });

  test('rolls back a deleted character first message at the original index', async () => {
    const mock = installMockSillyTavern({
      characters: {
        Alice: {
          first_messages: ['zero', 'one', 'two'],
        },
      },
    });

    const result = await deleteAction({ file_path: '/Characters/Alice/FirstMessages/1' });

    expect(mock.characters.get('Alice')?.first_messages).toStrictEqual(['zero', 'two']);
    await deleteRollback(result.backup);
    expect(mock.characters.get('Alice')?.first_messages).toStrictEqual(['zero', 'one', 'two']);
  });

  test('rolls back a deleted character regex file', async () => {
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

    const result = await deleteAction({ file_path: '/Characters/Alice/Regex/Normalize' });

    expect(mock.characters.get('Alice')?.extensions.regex_scripts).toStrictEqual([]);
    await deleteRollback(result.backup);
    expect(mock.characters.get('Alice')?.extensions.regex_scripts).toHaveLength(1);
    expect(mock.characters.get('Alice')?.extensions.regex_scripts?.[0]).toMatchObject({
      script_name: 'Normalize',
      replace_string: 'bar',
      find_regex: 'foo',
      enabled: true,
    });
  });

  test('rolls back a deleted character script file', async () => {
    const mock = installMockSillyTavern({
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
                  content: 'console.log(1)',
                  info: 'setup',
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

    const result = await deleteAction({ file_path: '/Characters/Alice/Scripts/Setup' });

    expect(mock.characters.get('Alice')?.extensions.tavern_helper?.scripts).toStrictEqual([]);
    await deleteRollback(result.backup);
    expect(mock.characters.get('Alice')?.extensions.tavern_helper?.scripts).toHaveLength(1);
    expect(mock.characters.get('Alice')?.extensions.tavern_helper?.scripts?.[0]).toMatchObject({
      name: 'Setup',
      content: 'console.log(1)',
      enabled: true,
    });
  });

  test('rolls back a deleted worldbook entry through character WorldBook alias', async () => {
    const mock = installMockSillyTavern({
      books: {
        设定集: buildBook([{ uid: 1, comment: '正文', content: 'abc', attributes: { enabled: false } }]),
      },
      characters: {
        Alice: {
          worldbook: '设定集',
        },
      },
    });

    const result = await deleteAction({ file_path: '/Characters/Alice/WorldBook/正文' });

    expect(result).toMatchObject({
      filePath: '/Characters/Alice/WorldBook/正文',
      backup: {
        rollbackMethod: 'deleteRollback',
        strategy: 'write',
        filePath: '/Characters/Alice/WorldBook/正文',
        content: 'abc',
      },
    });
    expect(mock.worldbooks.get('设定集')).toHaveLength(0);

    await deleteRollback(result.backup);
    expect(mock.worldbooks.get('设定集')).toHaveLength(1);
    expect(mock.worldbooks.get('设定集')?.[0]).toMatchObject({
      content: 'abc',
      enabled: false,
    });
    expect(mock.rawBooks.get('设定集')?.entries[0]).toMatchObject({
      comment: '正文',
      content: 'abc',
    });
  });

  test('rejects virtual directory path', async () => {
    installMockSillyTavern({
      books: {
        设定集: buildBook([{ uid: 1, comment: 'Folder/Content', content: 'abc' }]),
      },
    });

    const error = await expectToolError(deleteAction({ file_path: '/Worldbooks/设定集/Folder' }));

    expect(error.errorType).toBe('InputValidationError');
  });

  test('returns ENTRY_NOT_FOUND for missing entry', async () => {
    installMockSillyTavern({
      books: {
        设定集: buildBook([]),
      },
    });

    const error = await expectToolError(deleteAction({ file_path: '/Worldbooks/设定集/不存在' }));

    expect(error.errorType).toBe('ENTRY_NOT_FOUND');
  });
});
