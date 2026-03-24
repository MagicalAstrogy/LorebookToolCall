import { buildPathIndex } from '../src/wtc/store';

function rawEntry(uid: number, comment: string, content = ''): SillyTavern.v2DataWorldInfoEntry {
  //@ts-expect-error 类型定义不符
  return {
    uid: uid,
    comment: comment,
    content: content,
  } as SillyTavern.v2DataWorldInfoEntry;
}

describe('buildPathIndex', () => {
  test('supports array-like worldbook entries objects', () => {
    const book = {
      name: '设定集',
      //@ts-expect-error 类型定义不符
      entries: {
        0: rawEntry(1, '章节/正文', '第一段'),
        1: rawEntry(2, '附录', '补充'),
        length: 2,
      },
    } satisfies SillyTavern.v2WorldInfoBook;

    //@ts-expect-error 类型定义不符
    const index = buildPathIndex('设定集', book);

    expect(index.files.map(file => file.filePath)).toStrictEqual(['/Worldbooks/设定集/章节/正文', '/Worldbooks/设定集/附录']);
    expect(index.directories).toContain('/Worldbooks/设定集/');
    expect(index.directories).toContain('/Worldbooks/设定集/章节/');
    expect(index.exactFiles.get('/Worldbooks/设定集/章节/正文')?.uid).toBe(1);
    expect(index.exactFiles.get('/Worldbooks/设定集/附录')?.uid).toBe(2);
  });
});
