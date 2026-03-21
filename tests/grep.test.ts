import { grepAction } from '../src/wtc/actions/grep';
import { resetPermissionCache } from '../src/wtc/permission';
import { buildBook, installMockSillyTavern } from './helpers/mock_sillytavern';
import { expectToolError } from './helpers/tool_assert';

afterEach(() => {
  resetPermissionCache();
});

describe('grepAction', () => {
  test('returns files_with_matches with head_limit and type filtering', async () => {
    installMockSillyTavern({
      books: {
        设定集: buildBook([
          { uid: 1, comment: 'notes/a.md', content: 'hello world' },
          { uid: 2, comment: 'notes/b.md', content: 'hello again' },
          { uid: 3, comment: 'notes/c.txt', content: 'hello text' },
        ]),
      },
    });

    const result = await grepAction({
      path: '/设定集/notes',
      pattern: 'hello',
      output_mode: 'files_with_matches',
      type: 'md',
      head_limit: 1,
    });

    expect(result).toStrictEqual({
      mode: 'files_with_matches',
      filenames: ['/设定集/notes/a.md'],
      numFiles: 2,
      appliedLimit: 1,
    });
  });

  test('returns content mode with context lines in ripgrep-like format', async () => {
    installMockSillyTavern({
      books: {
        设定集: buildBook([{ uid: 1, comment: '正文.txt', content: '第一行\n命中行\n第三行' }]),
      },
    });

    const result = await grepAction({
      path: '/设定集',
      pattern: '命中',
      output_mode: 'content',
      context: 1,
    });

    expect(result).toStrictEqual({
      mode: 'content',
      content: '/设定集/正文.txt-1-第一行\n/设定集/正文.txt:2:命中行\n/设定集/正文.txt-3-第三行',
    });
  });

  test('rejects root path and invalid regex pattern', async () => {
    installMockSillyTavern({
      books: {
        设定集: buildBook([{ uid: 1, comment: '正文.txt', content: 'abc' }]),
      },
    });

    const rootError = await expectToolError(grepAction({ path: '/', pattern: 'abc' }));
    expect(rootError.errorType).toBe('InputValidationError');

    const regexError = await expectToolError(grepAction({ path: '/设定集', pattern: '[' }));
    expect(regexError.errorType).toBe('InputValidationError');
    expect(regexError.details?.[0]?.path).toStrictEqual(['pattern']);
  });
});
