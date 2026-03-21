import { setAttributeAction, setAttributeRollback } from '../src/wtc/actions/set_attribute';
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

describe('setAttributeAction', () => {
  test('patches attributes with recursive object merge and array replacement', async () => {
    const mock = installMockSillyTavern({
      books: {
        设定集: buildBook([
          {
            uid: 1,
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
    expect((result.attributes.strategy as any).keys).toStrictEqual(['新关键字']);
    expect((result.attributes.strategy as any).type).toBe('selective');
    expect((result.attributes.position as any).depth).toBe(4);
    expect((result.attributes.position as any).order).toBe(10);
    expect(result.attributes).not.toHaveProperty('content');
    expect(result.attributes).not.toHaveProperty('comment');
    expect(result.backup).toMatchObject({
      rollbackMethod: 'setAttributeRollback',
      worldbookName: '设定集',
      filePath: '/设定集/正文',
      uid: 1,
    });
    expect(result.backup.rollbackPatch).toStrictEqual({
      enabled: true,
      strategy: {
        keys: ['旧关键字'],
      },
      position: {
        depth: 1,
      },
    });
    expect(mock.worldbooks.get('设定集')?.[0]?.position.depth).toBe(4);
  });

  test('rolls back patched attributes using backup', async () => {
    const mock = installMockSillyTavern({
      books: {
        设定集: buildBook([
          {
            uid: 1,
            comment: '正文',
            content: '内容',
            attributes: {
              enabled: true,
              probability: 42,
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
        position: {
          depth: 4,
        },
      },
    });
    await setAttributeRollback(result.backup);

    expect(mock.worldbooks.get('设定集')?.[0]?.enabled).toBe(true);
    expect(mock.worldbooks.get('设定集')?.[0]?.position.depth).toBe(1);
    expect(mock.worldbooks.get('设定集')?.[0]?.content).toBe('内容');
  });

  test('rolls back only touched fields and preserves later unrelated changes', async () => {
    const mock = installMockSillyTavern({
      books: {
        设定集: buildBook([
          {
            uid: 1,
            comment: '正文',
            content: '内容',
            attributes: {
              enabled: true,
              probability: 42,
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
        position: {
          depth: 4,
        },
      },
    });

    await updateWorldbookWith('设定集', worldbook =>
      worldbook.map(entry =>
        entry.uid === 1
          ? {
              ...entry,
              probability: 99,
              position: {
                ...entry.position,
                order: 77,
              },
            }
          : entry,
      ),
    );

    await setAttributeRollback(result.backup);

    expect(mock.worldbooks.get('设定集')?.[0]?.enabled).toBe(true);
    expect(mock.worldbooks.get('设定集')?.[0]?.position.depth).toBe(1);
    expect(mock.worldbooks.get('设定集')?.[0]?.probability).toBe(99);
    expect(mock.worldbooks.get('设定集')?.[0]?.position.order).toBe(77);
  });

  test('decodes numeric sentinels before applying the patch', async () => {
    const mock = installMockSillyTavern({
      books: {
        设定集: buildBook([
          {
            uid: 1,
            comment: '正文',
            content: '内容',
            attributes: {
              strategy: {
                type: 'selective',
                keys: ['旧关键字'],
                keys_secondary: { logic: 'and_any', keys: ['副关键字'] },
                scan_depth: 3,
              },
              recursion: {
                prevent_incoming: false,
                prevent_outgoing: false,
                delay_until: 2,
              },
              effect: {
                sticky: 4,
                cooldown: 5,
                delay: 6,
              },
            },
          },
        ]),
      },
    });

    const result = await setAttributeAction({
      file_path: '/设定集/正文',
      attributes: {
        strategy: {
          scan_depth: WORLDBOOK_ENTRY_PATCH_SCAN_DEPTH_SAME_AS_GLOBAL,
        },
        recursion: {
          delay_until: WORLDBOOK_ENTRY_PATCH_NULL_SENTINEL,
        },
        effect: {
          sticky: WORLDBOOK_ENTRY_PATCH_NULL_SENTINEL,
          cooldown: 7,
          delay: WORLDBOOK_ENTRY_PATCH_NULL_SENTINEL,
        },
      },
    });

    expect((result.attributes.strategy as any).scan_depth).toBe(WORLDBOOK_ENTRY_PATCH_SCAN_DEPTH_SAME_AS_GLOBAL);
    expect((result.attributes.recursion as any).delay_until).toBe(WORLDBOOK_ENTRY_PATCH_NULL_SENTINEL);
    expect((result.attributes.effect as any).sticky).toBe(WORLDBOOK_ENTRY_PATCH_NULL_SENTINEL);
    expect((result.attributes.effect as any).cooldown).toBe(7);
    expect((result.attributes.effect as any).delay).toBe(WORLDBOOK_ENTRY_PATCH_NULL_SENTINEL);
    expect(result.backup.rollbackPatch).toStrictEqual({
      strategy: {
        scan_depth: 3,
      },
      recursion: {
        delay_until: 2,
      },
      effect: {
        sticky: 4,
        cooldown: 5,
        delay: 6,
      },
    });
    expect(mock.worldbooks.get('设定集')?.[0]?.strategy.scan_depth).toBe('same_as_global');
    expect(mock.worldbooks.get('设定集')?.[0]?.recursion.delay_until).toBeNull();
    expect(mock.worldbooks.get('设定集')?.[0]?.effect.sticky).toBeNull();
    expect(mock.worldbooks.get('设定集')?.[0]?.effect.cooldown).toBe(7);
    expect(mock.worldbooks.get('设定集')?.[0]?.effect.delay).toBeNull();
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
