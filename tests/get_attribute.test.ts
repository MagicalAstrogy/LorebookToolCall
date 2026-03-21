import { getAttributeAction } from '../src/wtc/actions/get_attribute';
import { resetPermissionCache } from '../src/wtc/permission';
import { buildBook, installMockSillyTavern } from './helpers/mock_sillytavern';
import { expectToolError } from './helpers/tool_assert';

afterEach(() => {
  resetPermissionCache();
});

describe('getAttributeAction', () => {
  test('returns current worldbook entry attributes', async () => {
    installMockSillyTavern({
      books: {
        设定集: buildBook([
          {
            id: 1,
            comment: '正文',
            content: '内容',
            attributes: { enabled: false, probability: 42, position: { depth: 3 } as WorldbookEntry['position'] },
          },
        ]),
      },
    });

    const result = await getAttributeAction({ file_path: '/设定集/正文' });

    expect(result.filePath).toBe('/设定集/正文');
    expect(result.attributes.uid).toBe(1);
    expect(result.attributes.enabled).toBe(false);
    expect(result.attributes.probability).toBe(42);
    expect(result.attributes.position.depth).toBe(3);
    expect(result.attributes).not.toHaveProperty('content');
    expect(result.attributes).not.toHaveProperty('comment');
  });

  test('returns ENTRY_NOT_FOUND for missing path', async () => {
    installMockSillyTavern({
      books: {
        设定集: buildBook([]),
      },
    });

    const error = await expectToolError(getAttributeAction({ file_path: '/设定集/正文' }));

    expect(error.errorType).toBe('ENTRY_NOT_FOUND');
  });
});
