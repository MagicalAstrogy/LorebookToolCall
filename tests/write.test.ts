import { writeAction } from '../src/wtc/actions/write';
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
      file_path: '//设定集///新建/条目',
      content: '新内容',
    });

    expect(result).toStrictEqual({
      type: 'create',
      filePath: '/设定集/新建/条目',
      content: '新内容',
      structuredPatch: [],
      originalFile: null,
    });
    expect(mock.rawBooks.get('设定集')?.entries[0]?.comment).toBe('新建/条目');
  });

  test('updates an existing entry and returns originalFile plus patch', async () => {
    installMockSillyTavern({
      books: {
        设定集: buildBook([{ id: 1, comment: '正文', content: '旧文本' }]),
      },
    });

    const result = await writeAction({
      file_path: '/设定集/正文',
      content: '新文本',
    });

    expect(result.type).toBe('update');
    expect(result.filePath).toBe('/设定集/正文');
    expect(result.originalFile).toBe('旧文本');
    expect(result.content).toBe('新文本');
    expect(result.structuredPatch).toHaveLength(1);
  });

  test('rejects worldbook root path', async () => {
    installMockSillyTavern({
      books: {
        设定集: buildBook([]),
      },
    });

    const error = await expectToolError(writeAction({ file_path: '/设定集', content: 'x' }));

    expect(error.errorType).toBe('InputValidationError');
  });
});
