import { createLorebookAction } from '../src/wtc/actions/create_lorebook';
import { resetPermissionCache } from '../src/wtc/permission';
import { buildBook, installMockSillyTavern } from './helpers/mock_sillytavern';
import { expectToolError } from './helpers/tool_assert';

afterEach(() => {
  resetPermissionCache();
});

describe('createLorebookAction', () => {
  test('creates an empty lorebook', async () => {
    const mock = installMockSillyTavern();

    const result = await createLorebookAction({ lorebook_name: '全新设定' });

    expect(result).toStrictEqual({
      lorebookName: '全新设定',
      created: true,
    });
    expect(mock.rawBooks.get('全新设定')).toStrictEqual({ entries: [] });
  });

  test('returns WORLD_ALREADY_EXISTS when lorebook exists', async () => {
    installMockSillyTavern({
      books: {
        设定集: buildBook([]),
      },
    });

    const error = await expectToolError(createLorebookAction({ lorebook_name: '设定集' }));

    expect(error.errorType).toBe('WORLD_ALREADY_EXISTS');
  });

  test('rejects lorebook_name containing slash', async () => {
    installMockSillyTavern();

    const error = await expectToolError(createLorebookAction({ lorebook_name: '非法/名称' }));

    expect(error.errorType).toBe('InputValidationError');
    expect(error.details?.[0]?.path).toStrictEqual(['lorebook_name']);
  });
});
