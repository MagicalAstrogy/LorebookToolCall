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
      path: '/Worldbooks/设定集/notes',
      pattern: 'hello',
      output_mode: 'files_with_matches',
      type: 'md',
      head_limit: 1,
    });

    expect(result).toStrictEqual({
      mode: 'files_with_matches',
      filenames: ['/Worldbooks/设定集/notes/a.md'],
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
      path: '/Worldbooks/设定集',
      pattern: '命中',
      output_mode: 'content',
      context: 1,
    });

    expect(result).toStrictEqual({
      mode: 'content',
      content: '/Worldbooks/设定集/正文.txt-1-第一行\n/Worldbooks/设定集/正文.txt:2:命中行\n/Worldbooks/设定集/正文.txt-3-第三行',
    });
  });

  test('searches character Regex YFM files in both front matter and body', async () => {
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
                replace_string: 'bar body',
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

    const frontMatterResult = await grepAction({
      path: '/Characters/Alice/Regex',
      pattern: 'find_regex: foo',
      output_mode: 'files_with_matches',
    });
    expect(frontMatterResult).toStrictEqual({
      mode: 'files_with_matches',
      filenames: ['/Characters/Alice/Regex/Normalize'],
      numFiles: 1,
    });

    const bodyResult = await grepAction({
      path: '/Characters/Alice/Regex',
      pattern: 'bar body',
      output_mode: 'count',
    });
    expect(bodyResult).toStrictEqual({
      mode: 'count',
      numFiles: 1,
      filenames: [],
      content: '/Characters/Alice/Regex/Normalize:1',
    });
  });

  test('searches character Scripts YFM files', async () => {
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
                  content: 'console.log(\"hello\")',
                  info: 'bootstrap',
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

    const result = await grepAction({
      path: '/Characters/Alice/Scripts',
      pattern: 'bootstrap',
      output_mode: 'files_with_matches',
    });

    expect(result).toStrictEqual({
      mode: 'files_with_matches',
      filenames: ['/Characters/Alice/Scripts/Setup'],
      numFiles: 1,
    });
  });

  test('searches worldbook content through character WorldBook alias with logical paths', async () => {
    installMockSillyTavern({
      books: {
        设定集: buildBook([{ uid: 1, comment: 'Folder/Entry.md', content: 'hello world' }]),
      },
      characters: {
        Alice: {
          worldbook: '设定集',
        },
      },
    });

    const result = await grepAction({
      path: '/Characters/Alice/WorldBook',
      pattern: 'hello',
      output_mode: 'files_with_matches',
    });

    expect(result).toStrictEqual({
      mode: 'files_with_matches',
      filenames: ['/Characters/Alice/WorldBook/Folder/Entry.md'],
      numFiles: 1,
    });
  });

  test('rejects root or collection paths and invalid regex pattern', async () => {
    installMockSillyTavern({
      books: {
        设定集: buildBook([{ uid: 1, comment: '正文.txt', content: 'abc' }]),
      },
    });

    const rootError = await expectToolError(grepAction({ path: '/', pattern: 'abc' }));
    expect(rootError.errorType).toBe('InputValidationError');

    const collectionError = await expectToolError(grepAction({ path: '/Worldbooks', pattern: 'abc' }));
    expect(collectionError.errorType).toBe('InputValidationError');

    const regexError = await expectToolError(grepAction({ path: '/Worldbooks/设定集', pattern: '[' }));
    expect(regexError.errorType).toBe('InputValidationError');
    expect(regexError.details?.[0]?.path).toStrictEqual(['pattern']);
  });
});
