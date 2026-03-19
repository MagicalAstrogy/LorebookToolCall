import { setAttributeAction } from '../src/wtc/actions/set_attribute';
import { resetPermissionCache } from '../src/wtc/permission';
import { buildBook, installMockSillyTavern } from './helpers/mock_sillytavern';
import { expectToolError } from './helpers/tool_assert';

afterEach(() => {
  resetPermissionCache();
});

describe('setAttributeAction', () => {
  test('patches attributes with recursive object merge and array replacement', async () => {
    const mock = installMockSillyTavern({
      books: {
        设定集: buildBook([
          {
            id: 1,
            comment: '正文',
            content: '内容',
            attributes: {
              enabled: true,
              strategy: {
                type: 'selective',
                keys: ['旧关键字'],
                keys_secondary: { logic: 'and_any', keys: ['副关键字'] },
                scan_depth: 2,
              },
              position: {
                type: 'at_depth',
                role: 'system',
                depth: 1,
                order: 10,
              },
            },
          },
        ]),
      },
    });

    const result = await setAttributeAction({
      file_path: '/设定集/正文',
      attributes: {
        enabled: false,
        strategy: {
          keys: ['新关键字'],
        },
        position: {
          depth: 4,
        },
      },
    });

    expect(result.attributes.enabled).toBe(false);
    expect(result.attributes.strategy.keys).toStrictEqual(['新关键字']);
    expect(result.attributes.strategy.type).toBe('selective');
    expect(result.attributes.position.depth).toBe(4);
    expect(result.attributes.position.order).toBe(10);
    expect(mock.worldbooks.get('设定集')?.[0]?.position.depth).toBe(4);
  });

  test('returns ENTRY_NOT_FOUND for missing entry', async () => {
    installMockSillyTavern({
      books: {
        设定集: buildBook([]),
      },
    });

    const error = await expectToolError(
      setAttributeAction({
        file_path: '/设定集/正文',
        attributes: { enabled: false },
      }),
    );

    expect(error.errorType).toBe('ENTRY_NOT_FOUND');
  });
});
