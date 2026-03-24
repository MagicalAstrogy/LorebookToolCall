import { getAttributeAction } from '../src/wtc/actions/get_attribute';
import { resetPermissionCache } from '../src/wtc/permission';
import {
  WORLDBOOK_ENTRY_PATCH_NULL_SENTINEL,
  WORLDBOOK_ENTRY_PATCH_SCAN_DEPTH_SAME_AS_GLOBAL,
} from '../src/wtc/schema';
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
            uid: 1,
            comment: '正文',
            content: '内容',
            attributes: { enabled: false, probability: 42, position: { depth: 3 } as WorldbookEntry['position'] },
          },
        ]),
      },
    });

    const result = await getAttributeAction({ file_path: '/Worldbooks/设定集/正文' });

    expect(result.filePath).toBe('/Worldbooks/设定集/正文');
    expect(result.attributes.uid).toBe(1);
    expect(result.attributes.enabled).toBe(false);
    expect(result.attributes.probability).toBe(42);
    expect((result.attributes.position as any).depth).toBe(3);
    expect(result.attributes).not.toHaveProperty('content');
    expect(result.attributes).not.toHaveProperty('comment');
  });

  test('encodes internal special values for llm-facing output', async () => {
    installMockSillyTavern({
      books: {
        设定集: buildBook([
          {
            uid: 1,
            comment: '正文',
            content: '内容',
            attributes: {
              strategy: {
                type: 'selective',
                keys: ['关键字'],
                keys_secondary: { logic: 'and_any', keys: ['副关键字'] },
                scan_depth: 'same_as_global',
              },
              recursion: {
                prevent_incoming: false,
                prevent_outgoing: false,
                delay_until: null,
              },
              effect: {
                sticky: null,
                cooldown: 3,
                delay: null,
              },
            },
          },
        ]),
      },
    });

    const result = await getAttributeAction({ file_path: '/Worldbooks/设定集/正文' });

    expect((result.attributes.strategy as any).scan_depth).toBe(WORLDBOOK_ENTRY_PATCH_SCAN_DEPTH_SAME_AS_GLOBAL);
    expect((result.attributes.recursion as any).delay_until).toBe(WORLDBOOK_ENTRY_PATCH_NULL_SENTINEL);
    expect((result.attributes.effect as any).sticky).toBe(WORLDBOOK_ENTRY_PATCH_NULL_SENTINEL);
    expect((result.attributes.effect as any).cooldown).toBe(3);
    expect((result.attributes.effect as any).delay).toBe(WORLDBOOK_ENTRY_PATCH_NULL_SENTINEL);
  });

  test('returns ENTRY_NOT_FOUND for missing path', async () => {
    installMockSillyTavern({
      books: {
        设定集: buildBook([]),
      },
    });

    const error = await expectToolError(getAttributeAction({ file_path: '/Worldbooks/设定集/正文' }));

    expect(error.errorType).toBe('ENTRY_NOT_FOUND');
  });

  test('supports reading worldbook attributes through character WorldBook alias', async () => {
    installMockSillyTavern({
      books: {
        设定集: buildBook([
          {
            uid: 1,
            comment: '正文',
            content: '内容',
            attributes: { enabled: false, probability: 42 },
          },
        ]),
      },
      characters: {
        Alice: {
          worldbook: '设定集',
        },
      },
    });

    const result = await getAttributeAction({ file_path: '/Characters/Alice/WorldBook/正文' });

    expect(result.filePath).toBe('/Characters/Alice/WorldBook/正文');
    expect(result.attributes.uid).toBe(1);
    expect(result.attributes.enabled).toBe(false);
    expect(result.attributes.probability).toBe(42);
  });
});
