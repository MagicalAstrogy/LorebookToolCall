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

    const result = await globAction({ pattern: '*', path: "/" });

    expect(result).toStrictEqual({
      filenames: ['/Characters/', '/Presets/', '/Schemas/', '/Worldbooks/'],
      durationMs: 0,
      numFiles: 4,
      truncated: false,
    });
  });

  // 校验新增的 Preset schema 也会像 Regex/Script 一样暴露在 /Schemas 下。
  test('lists exported schema json files under the Schemas root', async () => {
    installMockSillyTavern({
      books: {},
    });

    const result = await globAction({ path: '/Schemas', pattern: '*' });

    expect(result).toStrictEqual({
      filenames: ['/Schemas/Preset.json', '/Schemas/Regex.json', '/Schemas/Script.json'],
      durationMs: 0,
      numFiles: 3,
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

    const result = await globAction({ path: '/Worldbooks/设定集', pattern: '*' });

    expect(result).toStrictEqual({
      filenames: ['/Worldbooks/设定集/Folder/'],
      durationMs: 0,
      numFiles: 1,
      truncated: false,
    });
  });

  test('supports recursive glob from root through the unified directory walk', async () => {
    installMockSillyTavern({
      books: {
        设定集: buildBook([{ uid: 1, comment: 'Folder/Entry', content: '正文' }]),
      },
      characters: {
        Alice: {
          description: 'desc',
        },
      },
    });

    const result = await globAction({ path: '/', pattern: '**/*' });

    expect(result).toStrictEqual({
      filenames: [
        '/Characters/',
        '/Characters/Alice/',
        '/Characters/Alice/Description.md',
        '/Characters/Alice/FirstMessages/',
        '/Characters/Alice/Regex/',
        '/Characters/Alice/Scripts/',
        '/Presets/',
        '/Schemas/',
        '/Schemas/Preset.json',
        '/Schemas/Regex.json',
        '/Schemas/Script.json',
        '/Worldbooks/',
        '/Worldbooks/设定集/',
        '/Worldbooks/设定集/Folder/',
        '/Worldbooks/设定集/Folder/Entry',
      ],
      durationMs: 0,
      numFiles: 15,
      truncated: false,
    });
  });

  test('follows character WorldBook symlink recursively while keeping logical paths', async () => {
    installMockSillyTavern({
      books: {
        设定集: buildBook([
          { uid: 1, comment: 'README', content: 'readme' },
          { uid: 2, comment: 'Folder/Entry', content: '正文' },
        ]),
      },
      characters: {
        Alice: {
          worldbook: '设定集',
        },
      },
    });

    const result = await globAction({ path: '/Characters/Alice', pattern: '**/*' });

    expect(result).toStrictEqual({
      filenames: [
        '/Characters/Alice/Description.md',
        '/Characters/Alice/FirstMessages/',
        '/Characters/Alice/Regex/',
        '/Characters/Alice/Scripts/',
        '/Characters/Alice/WorldBook/',
        '/Characters/Alice/WorldBook/Folder/',
        '/Characters/Alice/WorldBook/Folder/Entry',
        '/Characters/Alice/WorldBook/README',
      ],
      durationMs: 0,
      numFiles: 8,
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

    const result = await globAction({ path: '/Worldbooks/-SnowYuki', pattern: '**/*' });

    expect(result).toStrictEqual({
      filenames: ['/Worldbooks/-SnowYuki/Folder/', '/Worldbooks/-SnowYuki/Folder/Nested', '/Worldbooks/-SnowYuki/README'],
      durationMs: 0,
      numFiles: 3,
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
