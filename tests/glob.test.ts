import { globAction } from '../src/wtc/actions/glob';
import { resetPermissionCache } from '../src/wtc/permission';
import { buildBook, installMockSillyTavern } from './helpers/mock_sillytavern';
import { expectToolError } from './helpers/tool_assert';

afterEach(() => {
  resetPermissionCache();
});

describe('globAction', () => {
  test('lists lorebooks from root and skips names containing slash', async () => {
    installMockSillyTavern({
      books: {
        设定集: buildBook([]),
        '非法/名称': buildBook([]),
        角色集: buildBook([]),
      },
    });

    const result = await globAction({ pattern: '*' });

    expect(result).toStrictEqual({
      filenames: ['/角色集/', '/设定集/'],
      durationMs: 0,
      numFiles: 2,
      truncated: false,
    });
  });

  test('lists files and directories under a lorebook path', async () => {
    installMockSillyTavern({
      books: {
        设定集: buildBook([
          { uid: 1, comment: 'Folder', content: '目录同名文件' },
          { uid: 2, comment: 'Folder/Content', content: '正文' },
        ]),
      },
    });

    const result = await globAction({ path: '/设定集', pattern: '*' });

    expect(result).toStrictEqual({
      filenames: ['/设定集/Folder', '/设定集/Folder/'],
      durationMs: 0,
      numFiles: 2,
      truncated: false,
    });
  });

  test('matches top-level and nested entries for **/* under hyphenated lorebook names', async () => {
    installMockSillyTavern({
      books: {
        '-SnowYuki': buildBook([
          { uid: 1, comment: 'README', content: '根目录文件' },
          { uid: 2, comment: 'Folder/Nested', content: '嵌套文件' },
        ]),
      },
    });

    const result = await globAction({ path: '/-SnowYuki', pattern: '**/*' });

    expect(result).toStrictEqual({
      filenames: ['/-SnowYuki/Folder', '/-SnowYuki/Folder/', '/-SnowYuki/Folder/Nested', '/-SnowYuki/README'],
      durationMs: 0,
      numFiles: 4,
      truncated: false,
    });
  });

  test('rejects non-absolute path', async () => {
    installMockSillyTavern();

    const error = await expectToolError(globAction({ path: '设定集', pattern: '*' }));

    expect(error.errorType).toBe('InputValidationError');
    expect(error.details).toStrictEqual([
      {
        expected: '合法的虚拟路径',
        received: '设定集',
        path: ['path'],
      },
    ]);
  });
});
