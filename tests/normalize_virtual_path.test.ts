import { normalizeVirtualPath } from '../src/wtc/store';

describe('normalizeVirtualPath', () => {
  test('normalizes repeated separators and dot segments', () => {
    expect(normalizeVirtualPath('//设定集///Folder/./Content')).toBe('/设定集/Folder/Content');
  });

  test('resolves parent segments inside the virtual root', () => {
    expect(normalizeVirtualPath('/设定集/章节/../正文')).toBe('/设定集/正文');
  });

  test('does not allow parent segments to escape above root', () => {
    expect(normalizeVirtualPath('/设定集/../../正文')).toBe('/正文');
  });

  test('keeps root path stable', () => {
    expect(normalizeVirtualPath('/')).toBe('/');
    expect(normalizeVirtualPath('/./../')).toBe('/');
  });

  test('rejects non-absolute paths', () => {
    expect(normalizeVirtualPath('设定集/正文')).toBeNull();
    expect(normalizeVirtualPath('./设定集/正文')).toBeNull();
  });
});
