import { resetPermissionCache } from '../src/wtc/permission';
import {
  basenameFromPath,
  comparePath,
  entryForFilePath,
  findDirectoryFileSpan,
  listImmediateChildren,
  normalizeChildPath,
} from '../src/wtc/node_fs/helpers';
import { LorebookEntryNode } from '../src/wtc/node_fs/lorebook_entry_node';
import { LorebookNode } from '../src/wtc/node_fs/lorebook_node';
import { resolveDirectoryNode, resolveFileNode, resolveSearchScope, resolveWritableFileNode } from '../src/wtc/node_fs/resolve';
import { RootNode } from '../src/wtc/node_fs/root_node';
import { isAttributeNode, isDeletableNode, isDirectoryNode, isTextFileNode } from '../src/wtc/node_fs/types';
import { directoryExistsInView, fileExistsInView, openLorebookView } from '../src/wtc/node_fs/view';
import { VirtualDirectoryNode } from '../src/wtc/node_fs/virtual_directory_node';
import { walkDirectory } from '../src/wtc/node_fs/walk';
import { buildBook, installMockSillyTavern } from './helpers/mock_sillytavern';

afterEach(() => {
  resetPermissionCache();
});

async function collectPaths(iterable: AsyncIterable<{ path: string }>) {
  const paths: string[] = [];
  for await (const node of iterable) {
    paths.push(node.path);
  }
  return paths;
}

describe('node_fs helpers and view', () => {
  test('opens sorted lorebook views and supports directory span queries', async () => {
    installMockSillyTavern({
      books: {
        设定集: buildBook([
          { uid: 3, comment: 'z-last', content: 'z' },
          { uid: 1, comment: 'Folder/Nested/a', content: 'a' },
          { uid: 2, comment: 'Folder/Nested/b', content: 'b' },
          { uid: 4, comment: 'Folder/Top', content: 'top' },
          { uid: 5, comment: 'README', content: 'readme' },
        ]),
      },
    });

    const view = await openLorebookView('设定集');

    expect(view.files.map(file => file.filePath)).toStrictEqual([
      '/Worldbooks/设定集/Folder/Nested/a',
      '/Worldbooks/设定集/Folder/Nested/b',
      '/Worldbooks/设定集/Folder/Top',
      '/Worldbooks/设定集/README',
      '/Worldbooks/设定集/z-last',
    ]);
    expect(directoryExistsInView(view, '/Worldbooks/设定集')).toBe(true);
    expect(directoryExistsInView(view, '/Worldbooks/设定集/Folder')).toBe(true);
    expect(directoryExistsInView(view, '/Worldbooks/设定集/missing')).toBe(false);
    expect(fileExistsInView(view, '/Worldbooks/设定集/README')).toBe(true);
    expect(fileExistsInView(view, '/Worldbooks/设定集/missing')).toBe(false);

    expect(basenameFromPath('/')).toBe('/');
    expect(basenameFromPath('/Worldbooks/设定集/Folder/Nested')).toBe('Nested');
    expect(normalizeChildPath('/Worldbooks/设定集/Folder/', 'Top')).toBe('/Worldbooks/设定集/Folder/Top');
    expect(comparePath('a', 'b')).toBeLessThan(0);
    expect(comparePath('b', 'a')).toBeGreaterThan(0);
    expect(comparePath('a', 'a')).toBe(0);

    expect(findDirectoryFileSpan(view, '/Worldbooks/设定集')).toStrictEqual({ fileStart: 0, fileEnd: 5 });
    expect(findDirectoryFileSpan(view, '/Worldbooks/设定集/Folder')).toStrictEqual({ fileStart: 0, fileEnd: 3 });
    expect(findDirectoryFileSpan(view, '/Worldbooks/设定集/Folder/Nested')).toStrictEqual({ fileStart: 0, fileEnd: 2 });

    expect(listImmediateChildren(view, '/Worldbooks/设定集', 0, 5)).toStrictEqual([
      {
        kind: 'directory',
        name: 'Folder',
        path: '/Worldbooks/设定集/Folder',
        fileStart: 0,
        fileEnd: 3,
      },
      {
        kind: 'file',
        name: 'README',
        entry: view.files[3],
      },
      {
        kind: 'file',
        name: 'z-last',
        entry: view.files[4],
      },
    ]);

    expect(listImmediateChildren(view, '/Worldbooks/设定集/Folder', 0, 3)).toStrictEqual([
      {
        kind: 'directory',
        name: 'Nested',
        path: '/Worldbooks/设定集/Folder/Nested',
        fileStart: 0,
        fileEnd: 2,
      },
      {
        kind: 'file',
        name: 'Top',
        entry: view.files[2],
      },
    ]);
  });

  test('detects conflicting normalized file paths', async () => {
    installMockSillyTavern({
      books: {
        设定集: buildBook([
          { uid: 1, comment: 'Folder/File', content: 'a' },
          { uid: 2, comment: 'Folder/./File', content: 'b' },
        ]),
      },
    });

    const view = await openLorebookView('设定集');

    try {
      entryForFilePath(view, '/Worldbooks/设定集/Folder/File');
      throw new Error('expected conflict');
    } catch (error) {
      expect(error).toMatchObject({
        errorType: 'PATH_CONFLICT',
      });
    }
  });
});

describe('node_fs node guards and root/lorebook nodes', () => {
  test('supports root and lorebook directory traversal', async () => {
    installMockSillyTavern({
      books: {
        设定集: buildBook([{ uid: 1, comment: 'README', content: 'readme' }]),
        '非法/名称': buildBook([]),
        角色集: buildBook([]),
      },
    });

    const root = new RootNode();
    expect(await root.stat()).toStrictEqual({
      path: '/',
      name: '/',
      kind: 'directory',
      readable: true,
      writable: false,
    });
    expect(await root.getChild('')).toBeNull();
    expect(await root.getChild('非法/名称')).toBeNull();
    expect(await root.getChild('Worldbooks')).not.toBeNull();
    expect(await collectPaths(root.list())).toStrictEqual(['/Characters', '/Worldbooks']);

    const lorebook = new LorebookNode('设定集');
    expect(await lorebook.stat()).toStrictEqual({
      path: '/Worldbooks/设定集',
      name: '设定集',
      kind: 'directory',
      readable: true,
      writable: true,
    });
    expect((await lorebook.openView()).worldbookName).toBe('设定集');
    expect(await collectPaths(lorebook.list())).toStrictEqual(['/Worldbooks/设定集/README']);
    expect(await lorebook.getChild('README')).toBeInstanceOf(LorebookEntryNode);
    expect(await lorebook.getChild('missing')).toBeNull();
  });

  test('type guards detect node capabilities', async () => {
    installMockSillyTavern({
      books: {
        设定集: buildBook([{ uid: 1, comment: '正文', content: '内容' }]),
      },
    });

    const root = new RootNode();
    const file = await resolveFileNode('/Worldbooks/设定集/正文');
    expect(file).not.toBeNull();
    expect(isDirectoryNode(root)).toBe(true);
    expect(isTextFileNode(root)).toBe(false);
    expect(isDirectoryNode(file!)).toBe(false);
    expect(isTextFileNode(file!)).toBe(true);
    expect(isAttributeNode(file!)).toBe(true);
    expect(isDeletableNode(file!)).toBe(true);
    expect(isAttributeNode({ path: '/x', stat: async () => ({ path: '/x', name: 'x', kind: 'file', readable: true, writable: false }) })).toBe(false);
  });
});

describe('node_fs virtual directories and entry nodes', () => {
  test('lists direct children using spans instead of full file scans', async () => {
    installMockSillyTavern({
      books: {
        设定集: buildBook([
          { uid: 1, comment: 'Folder/Content', content: 'content' },
          { uid: 2, comment: 'Folder/Nested/Leaf', content: 'leaf' },
          { uid: 3, comment: 'Folder/Z-last', content: 'z' },
        ]),
      },
    });

    const lorebook = new LorebookNode('设定集');
    const folder = await lorebook.getChild('Folder');
    expect(folder).toBeInstanceOf(VirtualDirectoryNode);
    expect(await folder!.stat()).toStrictEqual({
      path: '/Worldbooks/设定集/Folder',
      name: 'Folder',
      kind: 'directory',
      readable: true,
      writable: true,
    });
    expect(await collectPaths((folder as VirtualDirectoryNode).list())).toStrictEqual([
      '/Worldbooks/设定集/Folder/Content',
      '/Worldbooks/设定集/Folder/Nested',
      '/Worldbooks/设定集/Folder/Z-last',
    ]);
    expect(await (folder as VirtualDirectoryNode).getChild('Content')).toBeInstanceOf(LorebookEntryNode);
    expect(await (folder as VirtualDirectoryNode).getChild('Nested')).toBeInstanceOf(VirtualDirectoryNode);
    expect(await (folder as VirtualDirectoryNode).getChild('missing')).toBeNull();
  });

  test('can fall back to directory lookup when a virtual directory is created with a lazy or mismatched span', async () => {
    installMockSillyTavern({
      books: {
        设定集: buildBook([{ uid: 1, comment: 'Folder/Nested/Leaf', content: 'leaf' }]),
      },
    });

    const view = await openLorebookView('设定集');
    const folder = new VirtualDirectoryNode(view, '/Worldbooks/设定集/Folder', 0, 0);
    const nested = await folder.getChild('Nested');

    expect(nested).toBeInstanceOf(VirtualDirectoryNode);
    expect((nested as VirtualDirectoryNode).fileStart).toBe(0);
    expect((nested as VirtualDirectoryNode).fileEnd).toBe(1);
  });

  test('supports entry read, write, edit, delete, getattr and setattr flows', async () => {
    const mock = installMockSillyTavern({
      books: {
        设定集: buildBook([
          {
            uid: 1,
            comment: '正文',
            content: '第一行\n第二行\n第二行',
            attributes: {
              enabled: true,
              probability: 50,
            },
          },
        ]),
      },
    });

    const file = (await resolveFileNode('/Worldbooks/设定集/正文'))!;

    expect(await file.stat()).toStrictEqual({
      path: '/Worldbooks/设定集/正文',
      name: '正文',
      kind: 'file',
      readable: true,
      writable: true,
    });
    expect(await file.read()).toBe('第一行\n第二行\n第二行');
    expect(await file.read({ offset: 1, limit: 1 })).toBe('第二行');

    await file.write('覆盖后');
    expect(mock.worldbooks.get('设定集')?.[0]?.content).toBe('覆盖后');

    await file.write('A\nB\nB');
    const singleEditError = file.edit({ oldString: 'B', newString: 'C' });
    await expect(singleEditError).rejects.toMatchObject({
      errorType: 'InputValidationError',
    });
    await expect(file.edit({ oldString: 'missing', newString: 'x' })).rejects.toMatchObject({
      errorType: 'TEXT_NOT_FOUND',
    });

    const editResult = await file.edit({ oldString: 'B', newString: 'C', replaceAll: true });
    expect(editResult).toStrictEqual({
      originalContent: 'A\nB\nB',
      updatedContent: 'A\nC\nC',
      replaceAll: true,
    });
    expect(mock.worldbooks.get('设定集')?.[0]?.content).toBe('A\nC\nC');

    expect(isAttributeNode(file)).toBe(true);
    expect(isDeletableNode(file)).toBe(true);
    if (!isAttributeNode(file) || !isDeletableNode(file)) {
      throw new Error('expected attribute + deletable file node');
    }

    expect(await file.getattr()).toMatchObject({
      uid: 1,
      enabled: true,
      probability: 50,
      content: 'A\nC\nC',
    });

    const patched = await file.setattr({ enabled: false, position: { depth: 4 } });
    expect(patched).toMatchObject({
      uid: 1,
      enabled: false,
    });
    expect((mock.worldbooks.get('设定集')?.[0]?.position as WorldbookEntry['position']).depth).toBe(4);

    await file.delete();
    expect(mock.worldbooks.get('设定集')).toStrictEqual([]);
    await expect(file.delete()).rejects.toMatchObject({
      errorType: 'ENTRY_NOT_FOUND',
    });
    await expect(file.getattr()).rejects.toMatchObject({
      errorType: 'tool_use_error',
    });
    await expect(file.setattr({ enabled: true })).rejects.toMatchObject({
      errorType: 'ENTRY_NOT_FOUND',
    });
  });
});

describe('node_fs resolve and walk', () => {
  test('resolves directories, files and search scopes with directory-first name occupancy', async () => {
    installMockSillyTavern({
      books: {
        设定集: buildBook([
          { uid: 1, comment: 'Folder', content: 'same name file' },
          { uid: 2, comment: 'Folder/Content', content: 'nested' },
          { uid: 3, comment: 'Folder/Sub/Leaf', content: 'leaf' },
        ]),
      },
    });

    expect(await resolveDirectoryNode('relative')).toBeNull();
    expect(await resolveDirectoryNode('/')).toBeInstanceOf(RootNode);
    expect(await resolveDirectoryNode('/Worldbooks/设定集')).toBeInstanceOf(LorebookNode);
    const dir = await resolveDirectoryNode('/Worldbooks/设定集/Folder');
    expect(dir).toBeInstanceOf(VirtualDirectoryNode);
    expect(await resolveDirectoryNode('/Worldbooks/设定集/missing')).toBeNull();

    expect(await resolveFileNode('/')).toBeNull();
    expect(await resolveFileNode('/Worldbooks/设定集')).toBeNull();
    const conflictedFile = await resolveFileNode('/Worldbooks/设定集/Folder');
    expect(conflictedFile).not.toBeNull();
    await expect(conflictedFile!.read()).rejects.toMatchObject({
      errorType: 'PATH_CONFLICT',
    });
    expect(await resolveFileNode('/Worldbooks/设定集/missing')).toBeNull();

    const search = await resolveSearchScope('/Worldbooks/设定集/Folder');
    expect(search.fileNode).not.toBeNull();
    expect(search.directoryNode).toBeInstanceOf(VirtualDirectoryNode);
    expect((await resolveSearchScope('/')).directoryNode).toBeInstanceOf(RootNode);
  });

  test('walks directories in DFS order', async () => {
    installMockSillyTavern({
      books: {
        设定集: buildBook([
          { uid: 1, comment: 'README', content: 'readme' },
          { uid: 2, comment: 'Folder/Content', content: 'content' },
          { uid: 3, comment: 'Folder/Sub/Leaf', content: 'leaf' },
        ]),
      },
    });

    const root = (await resolveDirectoryNode('/Worldbooks/设定集')) as LorebookNode;
    const walked = await collectPaths(walkDirectory(root));

    expect(walked).toStrictEqual([
      '/Worldbooks/设定集/Folder',
      '/Worldbooks/设定集/Folder/Content',
      '/Worldbooks/设定集/Folder/Sub',
      '/Worldbooks/设定集/Folder/Sub/Leaf',
      '/Worldbooks/设定集/README',
    ]);
  });

  test('returns conflict nodes for duplicated exact paths', async () => {
    installMockSillyTavern({
      books: {
        设定集: buildBook([
          { uid: 1, comment: 'A', content: '1' },
          { uid: 2, comment: './A', content: '2' },
        ]),
      },
    });

    const conflicted = await resolveFileNode('/Worldbooks/设定集/A');
    expect(conflicted).not.toBeNull();
    await expect(conflicted!.read()).rejects.toMatchObject({
      errorType: 'PATH_CONFLICT',
    });
  });

  test('treats shadowed same-name files as conflicts while keeping directory traversal visible', async () => {
    installMockSillyTavern({
      books: {
        设定集: buildBook([
          { uid: 1, comment: 'Folder', content: 'shadowed file' },
          { uid: 2, comment: 'Folder/Leaf', content: 'leaf' },
        ]),
      },
    });

    const view = await openLorebookView('设定集');
    expect(view.files.map(file => file.filePath)).toStrictEqual(['/Worldbooks/设定集/Folder/Leaf']);
    expect(view.conflicts.has('/Worldbooks/设定集/Folder')).toBe(true);

    const directory = await resolveDirectoryNode('/Worldbooks/设定集/Folder');
    expect(directory).toBeInstanceOf(VirtualDirectoryNode);

    const fileNode = await resolveFileNode('/Worldbooks/设定集/Folder');
    expect(fileNode).not.toBeNull();
    await expect(fileNode!.write('x')).rejects.toMatchObject({
      errorType: 'PATH_CONFLICT',
    });

    const writableNode = await resolveWritableFileNode('/Worldbooks/设定集/Folder');
    expect(writableNode).not.toBeNull();
    await expect(writableNode!.write('x')).rejects.toMatchObject({
      errorType: 'PATH_CONFLICT',
    });
  });
});
