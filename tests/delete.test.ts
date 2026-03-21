import { deleteAction } from '../src/wtc/actions/delete';
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

    const result = await deleteAction({ file_path: '/设定集/正文' });

    expect(result).toStrictEqual({
      filePath: '/设定集/正文',
      deleted: true,
    });
    expect(mock.rawBooks.get('设定集')?.entries).toHaveLength(0);
  });

  test('rejects virtual directory path', async () => {
    installMockSillyTavern({
      books: {
        设定集: buildBook([{ uid: 1, comment: 'Folder/Content', content: 'abc' }]),
      },
    });

    const error = await expectToolError(deleteAction({ file_path: '/设定集/Folder' }));

    expect(error.errorType).toBe('InputValidationError');
  });

  test('returns ENTRY_NOT_FOUND for missing entry', async () => {
    installMockSillyTavern({
      books: {
        设定集: buildBook([]),
      },
    });

    const error = await expectToolError(deleteAction({ file_path: '/设定集/不存在' }));

    expect(error.errorType).toBe('ENTRY_NOT_FOUND');
  });
});
