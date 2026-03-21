type PopupResult = boolean | string;

interface MockEntry {
  uid: number;
  comment: string;
  content: string;
  name?: string;
  attributes?: Partial<WorldbookEntry>;
}

interface MockBook {
  entries: MockEntry[];
}

interface MockOptions {
  books?: Record<string, MockBook | null>;
  popupResult?: PopupResult;
}

interface MockSillyTavern {
  POPUP_TYPE: {
    CONFIRM: string;
    INPUT: string;
  };
  POPUP_RESULT: {
    AFFIRMATIVE: string;
    CUSTOM1: string;
    CANCELLED: string;
  };
  loadWorldInfo(name: string): Promise<MockBook | null>;
  saveWorldInfo(name: string, book: MockBook, immediate: boolean): Promise<void>;
  reloadWorldInfoEditor(name: string, keepOpen: boolean): void;
  updateWorldInfoList(): Promise<void>;
  callGenericPopup(message: string, type: string, value: string, options: Record<string, unknown>): Promise<PopupResult>;
  isToolCallingSupported(): boolean;
  canPerformToolCalls(type: string): boolean;
  registerFunctionTool(): void;
  unregisterFunctionTool(): void;
}

function basenameFromComment(comment: string) {
  const parts = comment.split('/').filter(Boolean);
  return parts[parts.length - 1] || '新条目';
}

function createDefaultWorldbookEntry(uid: number, name: string, content: string): WorldbookEntry {
  return {
    uid,
    name,
    enabled: true,
    strategy: {
      type: 'constant',
      keys: [],
      keys_secondary: { logic: 'and_any', keys: [] },
      scan_depth: 'same_as_global',
    },
    position: {
      type: 'before_character_definition',
      role: 'system',
      depth: 0,
      order: 100,
    },
    content,
    probability: 100,
    recursion: {
      prevent_incoming: false,
      prevent_outgoing: false,
      delay_until: null,
    },
    effect: {
      sticky: null,
      cooldown: null,
      delay: null,
    },
    extra: {},
  };
}

function cloneRawBook(book: MockBook | null): MockBook | null {
  if (!book) {
    return null;
  }
  return {
    entries: book.entries.map(entry => ({
      ...entry,
      attributes: entry.attributes ? structuredClone(entry.attributes) : undefined,
    })),
  };
}

function cloneWorldbook(entries: WorldbookEntry[]) {
  return structuredClone(entries);
}

function buildState(options: MockOptions) {
  const rawBooks = new Map<string, MockBook | null>();
  const worldbooks = new Map<string, WorldbookEntry[]>();
  let nextUid = 1;

  for (const [name, book] of Object.entries(options.books ?? {})) {
    const cloned = cloneRawBook(book);
    rawBooks.set(name, cloned);
    if (!cloned) {
      continue;
    }
    const entries = cloned.entries.map(raw => {
      nextUid = Math.max(nextUid, raw.uid + 1);
      const entry = createDefaultWorldbookEntry(raw.uid, raw.name ?? basenameFromComment(raw.comment), raw.content);
      return {
        ...entry,
        ...structuredClone(raw.attributes ?? {}),
        uid: raw.uid,
        name: raw.attributes?.name ?? raw.name ?? entry.name,
        content: raw.content,
      } satisfies WorldbookEntry;
    });
    worldbooks.set(name, entries);
  }

  function ensureWorldbook(name: string) {
    const raw = rawBooks.get(name) ?? null;
    const worldbook = worldbooks.get(name);
    if (!raw || !worldbook) {
      throw new Error(`Worldbook '${name}' does not exist in mock state.`);
    }
    return { raw, worldbook };
  }

  function syncRawFromWorldbook(name: string) {
    const raw = rawBooks.get(name);
    const worldbook = worldbooks.get(name);
    if (!raw || !worldbook) {
      return;
    }
    raw.entries = raw.entries
      .filter(rawEntry => worldbook.some(entry => entry.uid === rawEntry.uid))
      .map(rawEntry => {
        const entry = worldbook.find(item => item.uid === rawEntry.uid)!;
        return {
          ...rawEntry,
          name: entry.name,
          content: entry.content,
        };
      });
  }

  return {
    rawBooks,
    worldbooks,
    ensureWorldbook,
    syncRawFromWorldbook,
    allocateUid() {
      const uid = nextUid;
      nextUid += 1;
      return uid;
    },
  };
}

export function installMockSillyTavern(options: MockOptions = {}) {
  const popupCalls: Array<{ message: string; type: string; value: string; options: Record<string, unknown> }> = [];
  const state = buildState(options);

  const mock: MockSillyTavern = {
    POPUP_TYPE: {
      CONFIRM: 'confirm',
      INPUT: 'input',
    },
    POPUP_RESULT: {
      AFFIRMATIVE: 'affirmative',
      CUSTOM1: 'custom1',
      CANCELLED: 'cancelled',
    },
    async loadWorldInfo(name: string) {
      return cloneRawBook(state.rawBooks.get(name) ?? null);
    },
    async saveWorldInfo(name: string, book: MockBook) {
      const cloned = cloneRawBook(book);
      state.rawBooks.set(name, cloned);
      if (!cloned) {
        state.worldbooks.delete(name);
        return;
      }
      const existing = state.worldbooks.get(name) ?? [];
      state.worldbooks.set(
        name,
        cloned.entries.map(rawEntry => {
          const previous = existing.find(entry => entry.uid === rawEntry.uid);
          return {
            ...(previous ?? createDefaultWorldbookEntry(rawEntry.uid, rawEntry.name ?? basenameFromComment(rawEntry.comment), rawEntry.content)),
            uid: rawEntry.uid,
            name: rawEntry.name ?? previous?.name ?? basenameFromComment(rawEntry.comment),
            content: rawEntry.content,
          };
        }),
      );
    },
    reloadWorldInfoEditor() {},
    async updateWorldInfoList() {},
    async callGenericPopup(message: string, type: string, value: string, popupOptions: Record<string, unknown>) {
      popupCalls.push({ message, type, value, options: popupOptions });
      return options.popupResult ?? true;
    },
    isToolCallingSupported() {
      return true;
    },
    canPerformToolCalls() {
      return true;
    },
    registerFunctionTool() {},
    unregisterFunctionTool() {},
  };
  (globalThis as any).SillyTavern = mock;
  (globalThis as any)._ = _;

  (globalThis as any).getWorldbookNames = () => [...state.rawBooks.keys()];
  (globalThis as any).getWorldbook = async (name: string) => {
    const worldbook = state.worldbooks.get(name);
    if (!worldbook) {
      throw new Error(`Worldbook '${name}' not found.`);
    }
    return cloneWorldbook(worldbook);
  };
  (globalThis as any).createWorldbook = async (name: string, worldbook: WorldbookEntry[] = []) => {
    if (state.rawBooks.has(name) && state.rawBooks.get(name) !== null) {
      return false;
    }
    state.rawBooks.set(name, { entries: [] });
    state.worldbooks.set(name, cloneWorldbook(worldbook));
    state.syncRawFromWorldbook(name);
    return true;
  };
  (globalThis as any).updateWorldbookWith = async (name: string, updater: (worldbook: WorldbookEntry[]) => WorldbookEntry[]) => {
    const { worldbook } = state.ensureWorldbook(name);
    const updated = updater(cloneWorldbook(worldbook));
    state.worldbooks.set(name, cloneWorldbook(updated));
    state.syncRawFromWorldbook(name);
    return cloneWorldbook(updated);
  };
  (globalThis as any).createWorldbookEntries = async (
    name: string,
    newEntries: Partial<WorldbookEntry>[],
  ) => {
    const { raw, worldbook } = state.ensureWorldbook(name);
    const created = newEntries.map(partial => {
      const uid = state.allocateUid();
      const entry = {
        ...createDefaultWorldbookEntry(uid, partial.name ?? '新条目', partial.content ?? ''),
        ...structuredClone(partial),
        uid,
        name: partial.name ?? '新条目',
        content: partial.content ?? '',
      } satisfies WorldbookEntry;
      raw.entries.push({
        uid: uid,
        comment: '',
        content: entry.content,
        name: entry.name,
      });
      return entry;
    });
    const updated = [...worldbook, ...created];
    state.worldbooks.set(name, cloneWorldbook(updated));
    state.syncRawFromWorldbook(name);
    return {
      worldbook: cloneWorldbook(updated),
      new_entries: cloneWorldbook(created),
    };
  };
  (globalThis as any).deleteWorldbookEntries = async (name: string, predicate: (entry: WorldbookEntry) => boolean) => {
    const { raw, worldbook } = state.ensureWorldbook(name);
    const deletedEntries = worldbook.filter(predicate);
    const deletedIds = new Set(deletedEntries.map(entry => entry.uid));
    const kept = worldbook.filter(entry => !deletedIds.has(entry.uid));
    state.worldbooks.set(name, cloneWorldbook(kept));
    raw.entries = raw.entries.filter(entry => !deletedIds.has(entry.uid));
    return {
      worldbook: cloneWorldbook(kept),
      deleted_entries: cloneWorldbook(deletedEntries),
    };
  };

  return {
    popupCalls,
    rawBooks: state.rawBooks,
    worldbooks: state.worldbooks,
  };
}

export function buildBook(entries: MockEntry[]): MockBook {
  return { entries };
}
import _ from 'lodash';
