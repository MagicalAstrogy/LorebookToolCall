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
      file_path: '//设定集///Folder/./Content',
    });

    expect(result).toStrictEqual({
      type: 'text',
      file: {
        filePath: '/设定集/Folder/Content',
        content: '     1\t第一行\n     2\t第二行',
        numLines: 2,
        startLine: 1,
        totalLines: 2,
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
      file_path: '/设定集/章节/正文',
      offset: 1,
      limit: 2,
    });

    expect(result).toStrictEqual({
      type: 'text',
      file: {
        filePath: '/设定集/章节/正文',
        content: '     2\t第2行\n     3\t第3行',
        numLines: 2,
        startLine: 2,
        totalLines: 4,
      },
    });
  });

  test('returns CONTENT_TOO_LARGE when limit is omitted and projected content exceeds 5000 chars', async () => {
    installMockSillyTavern({
      books: {
        设定集: buildBook([
          {
            uid: 1,
            comment: '长文',
            content: 'a'.repeat(5001),
          },
        ]),
      },
    });

    const error = await expectToolError(
      readAction({
        file_path: '/设定集/长文',
      }),
    );

    expect(error.errorType).toBe('CONTENT_TOO_LARGE');
    expect(error.message).toMatch(/5000 字符/);
  });

  test('rejects worldbook root path as InputValidationError', async () => {
    installMockSillyTavern();

    const error = await expectToolError(
      readAction({
        file_path: '/设定集',
      }),
    );

    expect(error.errorType).toBe('InputValidationError');
    expect(error.details).toStrictEqual([
      {
        expected: '合法的虚拟路径',
        received: '/设定集',
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
        file_path: '/设定集/正文',
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
        file_path: '/设定集/正文',
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
        file_path: '/设定集/正文',
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
        file_path: '/设定集/不存在',
      }),
    );

    expect(error.errorType).toBe('ENTRY_NOT_FOUND');
  });

  test('returns WORLD_NOT_FOUND when the lorebook does not exist', async () => {
    installMockSillyTavern({
      books: {
        其他设定: buildBook([]),
      },
    });

    const error = await expectToolError(
      readAction({
        file_path: '/设定集/不存在',
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
        file_path: '/设定集/正文',
      }),
    );

    expect(error.errorType).toBe('PERMISSION_DENIED');
    expect(mock.popupCalls).toHaveLength(1);
  });
});
