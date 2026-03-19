import { editAction } from '../src/wtc/actions/edit';
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
        设定集: buildBook([{ id: 1, comment: '正文', content: 'hello world' }]),
      },
    });

    const result = await editAction({
      file_path: '/设定集/正文',
      old_string: 'world',
      new_string: 'jest',
    });

    expect(result).toMatchObject({
      filePath: '/设定集/正文',
      oldString: 'world',
      newString: 'jest',
      originalFile: 'hello world',
      userModified: false,
      replaceAll: false,
    });
    expect(result.structuredPatch).toHaveLength(1);
  });

  test('rejects ambiguous replacement unless replace_all is true', async () => {
    installMockSillyTavern({
      books: {
        设定集: buildBook([{ id: 1, comment: '正文', content: 'x hello x hello' }]),
      },
    });

    const error = await expectToolError(
      editAction({
        file_path: '/设定集/正文',
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
        设定集: buildBook([{ id: 1, comment: '正文', content: 'abc' }]),
      },
    });

    const error = await expectToolError(
      editAction({
        file_path: '/设定集/正文',
        old_string: 'zzz',
        new_string: 'hi',
      }),
    );

    expect(error.errorType).toBe('TEXT_NOT_FOUND');
  });
});
