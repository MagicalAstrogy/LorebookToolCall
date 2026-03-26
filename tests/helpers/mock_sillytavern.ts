import _ from 'lodash';
import type { PartialDeep } from 'type-fest';

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
  characters?: Record<string, PartialDeep<Character>>;
  presets?: Record<string, PartialDeep<Preset>>;
  loadedPresetName?: string;
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

function createDefaultCharacter(name: string): Character {
  return {
    avatar: `${name}.png`,
    version: '1.0.0',
    creator: 'test',
    creator_notes: '',
    worldbook: null,
    description: '',
    first_messages: [],
    extensions: {
      regex_scripts: [],
      tavern_helper: {
        scripts: [],
        variables: {},
      },
    },
  };
}

function createDefaultPreset(): Preset {
  // 只补齐当前测试会依赖的最小 preset 结构，避免每个用例都手写完整默认值。
  return {
    settings: {
      max_context: 8192,
      max_completion_tokens: 1024,
      reply_count: 1,
      should_stream: true,
      temperature: 1,
      frequency_penalty: 0,
      presence_penalty: 0,
      top_p: 1,
      repetition_penalty: 1,
      min_p: 0,
      top_k: 0,
      top_a: 0,
      seed: -1,
      squash_system_messages: false,
      reasoning_effort: 'auto',
      request_thoughts: false,
      request_images: false,
      enable_function_calling: true,
      enable_web_search: false,
      allow_sending_images: 'auto',
      allow_sending_videos: false,
      character_name_prefix: 'none',
      wrap_user_messages_in_quotes: false,
    },
    prompts: [],
    prompts_unused: [],
    extensions: {
      regex_scripts: [],
      tavern_helper: {
        scripts: [],
        variales: {},
      },
    },
  };
}

function buildState(options: MockOptions) {
  const rawBooks = new Map<string, MockBook | null>();
  const worldbooks = new Map<string, WorldbookEntry[]>();
  const characters = new Map<string, Character>();
  const presets = new Map<string, Preset>();
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

  for (const [name, partial] of Object.entries(options.characters ?? {})) {
    const base = createDefaultCharacter(name);
    characters.set(name, _.merge(structuredClone(base), structuredClone(partial)));
  }

  for (const [name, partial] of Object.entries(options.presets ?? {})) {
    const base = createDefaultPreset();
    presets.set(name, _.merge(structuredClone(base), structuredClone(partial)));
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
    characters,
    presets,
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
  let loadedPresetName = options.loadedPresetName ?? [...state.presets.keys()][0] ?? 'Default';

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
  (globalThis as any).getCharacterNames = () => [...state.characters.keys()];
  (globalThis as any).getPresetNames = () => [...state.presets.keys()];
  (globalThis as any).getLoadedPresetName = () => loadedPresetName;
  // preset mock 只实现当前绑定层/工具层实际会调用到的宿主接口。
  (globalThis as any).getPreset = (name: string) => {
    const preset = state.presets.get(name);
    if (!preset) {
      throw new Error(`Preset '${name}' not found.`);
    }
    return structuredClone(preset);
  };
  (globalThis as any).replacePreset = async (name: string, preset: Preset) => {
    if (!state.presets.has(name)) {
      throw new Error(`Preset '${name}' not found.`);
    }
    state.presets.set(name, structuredClone(preset));
  };
  (globalThis as any).loadPreset = (name: string) => {
    if (!state.presets.has(name)) {
      return false;
    }
    loadedPresetName = name;
    return true;
  };
  (globalThis as any).getCurrentCharacterName = () => {
    const first = state.characters.keys().next();
    return first.done ? null : first.value;
  };
  (globalThis as any).getCharacter = async (name: string) => {
    const resolved = name === 'current' ? (globalThis as any).getCurrentCharacterName() : name;
    const character = resolved ? state.characters.get(resolved) : undefined;
    if (!character) {
      throw new Error(`Character '${name}' not found.`);
    }
    return structuredClone(character);
  };
  (globalThis as any).updateCharacterWith = async (name: string, updater: (character: Character) => Character | Promise<Character>) => {
    const resolved = name === 'current' ? (globalThis as any).getCurrentCharacterName() : name;
    const current = resolved ? state.characters.get(resolved) : undefined;
    if (!resolved || !current) {
      throw new Error(`Character '${name}' not found.`);
    }
    const updated = await updater(structuredClone(current));
    state.characters.set(resolved, structuredClone(updated));
    return structuredClone(updated);
  };
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
    characters: state.characters,
    presets: state.presets,
  };
}

export function buildBook(entries: MockEntry[]): MockBook {
  return { entries };
}
