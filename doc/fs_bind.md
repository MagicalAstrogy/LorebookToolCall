# FS Bind 结论

## 术语与权限边界

对外文档统一使用 `Worldbook`，不再把对外概念写成 `Lorebook`。
内部实现里如果继续保留 `LorebookNode`、`openLorebookView()` 之类命名，只视为历史代码命名，不影响对外语义。

权限控制的授权粒度固定为两层目录：

- `/Worldbooks/<Name>`
- `/Characters/<Name>`

也就是说：

- 对单本 Worldbook 的读、写、删操作，都折算到 `/Worldbooks/<Name>`
- 对单个角色卡目录下的读、写、删操作，都折算到 `/Characters/<Name>`
- 通过 `/Characters/<Name>/WorldBook/...` 进入绑定的世界书时，实际权限仍应落到目标 `/Worldbooks/<WorldbookName>`

## 根结构

根目录调整为两个固定子目录：

- `/Worldbooks`
- `/Characters`

现有“根即 Worldbook 列表”的实现整体下移到 `/Worldbooks`。
旧路径：

- `/<WorldbookName>/...`

新路径：

- `/Worldbooks/<WorldbookName>/...`

`/Characters` 映射到角色卡列表。目录名使用角色卡 `name`，只暴露可安全映射为单一路径段的名称；名称中包含 `/`、`.`、`..` 语义的角色卡不进入文件树。

## Characters 目录映射

`/Characters/<CharacterName>` 是一个目录节点，当前只投影以下稳定子结构：

- `/Characters/<CharacterName>/Description.md`
- `/Characters/<CharacterName>/WorldBook`
- `/Characters/<CharacterName>/FirstMessages/`
- `/Characters/<CharacterName>/Regex/`
- `/Characters/<CharacterName>/Scripts/`

其他角色字段暂不直接投影到文件树，仍通过 `getCharacter()` / `updateCharacterWith()` 在绑定层内部访问。

### `Description.md`

- 映射 `character.description`
- 类型是普通文本文件
- `Read` 直接返回描述文本
- `Write` / `Edit` 通过 `updateCharacterWith()` 回写 `description`
- `Delete` 不支持

### `WorldBook`

- 映射 `character.worldbook`
- 当 `character.worldbook === null` 时，不暴露该子节点
- 当存在绑定时，`WorldBook` 是一个目录软链接，目标为 `/Worldbooks/<worldbookName>`
- 软链接本身不保存内容，进入 `WorldBook/...` 时等价于进入目标世界书子树
- 通过 `WorldBook/...` 访问 worldbook 文件时，逻辑路径仍保持在 `/Characters/<CharacterName>/WorldBook/...`
- `Read` / `Write` / `Edit` / `Delete` 都应作用到目标 worldbook 节点，但返回和回滚使用逻辑路径

### `FirstMessages`

- 映射 `character.first_messages`
- `FirstMessages` 是目录
- 其下文件名为数组下标字符串：`0`、`1`、`2` ...
- 已存在的数组项会在 `list()` 中暴露
- `Read` 读取对应下标的文本
- `Write` 支持写入尚未存在的下标，只要文件名是非负整数
- 当写入下标超出当前长度时，先按数组语义扩容，再写入目标位置
- `Edit` 建立在 `Read + Write` 之上
- `Delete` 删除该数组项，并按数组语义收缩后续下标
- `Delete` 的 rollback 不能只靠重新写回文件内容；需要按原数组下标插回，恢复删除前顺序

### `Regex`

- 映射 `character.extensions.regex_scripts`
- 宿主读写统一通过 [character.d.ts](../@types/function/character.d.ts) 中的 `getCharacter()` / `updateCharacterWith()` 完成
- `Regex` 是目录
- 子文件名使用 `TavernRegex.script_name`
- 文件内容使用 YAML Front Matter
- `script_name` 由文件名提供，不进入文件内容
- `replace_string` 作为 front matter 之后的正文内容
- 除 `script_name` 和 `replace_string` 外，其余字段都放在头部 YAML 块中
- `Read` 时输出完整的 `front matter + body`
- `Write` / `Edit` 针对“映射成 YFM 之后的完整文本”进行
- 对不存在的 `Regex/<script_name>` 执行 `Write` 视为新建
- `Delete` 删除对应的 regex 项
- `Delete` 的 rollback 通过同一路径重新 `Write` 完整 YFM 文本恢复

如果多个 regex 具有相同 `script_name`，则该路径视为冲突路径：

- `list()` 仍可报告冲突名
- `getChild()` / `read()` / `write()` 对该名字应返回冲突错误

如果某个 Worldbook 文件路径同时也是目录路径前缀，则目录占据该路径名，对应文件不再作为可见文件暴露，但仍计入文件语义冲突：

- 这类文件不参与 `getChild()`、`list()`、`glob()`、`grep()`
- 对同一路径做文件语义的 `read()`、`write()`、`edit()`、`delete()` 时，应返回冲突错误
- 调用方只能看到并进入目录

头部字段直接对应 [tavern_regex.d.ts](../@types/function/tavern_regex.d.ts) 中的 `TavernRegex`：

- 去掉由文件名提供的 `script_name`
- 去掉由正文提供的 `replace_string`
- 其余字段全部进入 front matter

### Regex 文件的 `Write` / `Edit` 语义

`Regex/<script_name>` 的 `Write` 和 `Edit` 都以“映射后的完整文本文件”为对象，也就是：

- 行号、offset、limit 都针对完整 YFM 文本计算
- `Edit` 替换的是完整文本中的字符串，而不是某个单独字段
- 保存时再把文本反序列化回 `TavernRegex`

`Write` 需要区分 `Create` 和 `Update`：

- `Update`:
  - 如果文本不含 front matter，仍然接受
  - 如果 front matter 存在但无效，仍然接受
  - 但返回结果中要给出 warning
  - 缺失头部时 warning 为 `Front Matter Missing`
  - 头部无效时 warning 为 `Invalid Front Matter,Ignored`
- `Create`:
  - 允许完全缺失 front matter
  - front matter 若存在，则必须合法
  - 如果 front matter 存在但无效，直接报错
  - 错误信息要明确指出头部不符合 schema
  - 如果 front matter 完全缺失，则使用一组默认头部字段创建对象

当 `Update` 发生 “Front Matter Missing” 或 “Invalid Front Matter,Ignored” 时：

- `replace_string` 取整个文本正文
- 头部字段回退为旧 regex 对象中的原值
- `script_name` 仍由文件名提供

当 `Create` 发生 “Front Matter Missing” 时：

- `replace_string` 取整个文本正文
- `script_name` 由文件名提供
- 其余字段使用默认值填充
- 生成出的完整对象仍必须通过 `TavernRegex` 结构校验

### `Scripts`

- 映射 `character.extensions.tavern_helper.scripts`
- 宿主读写统一通过 [character.d.ts](../@types/function/character.d.ts) 中的 `getCharacter()` / `updateCharacterWith()` 完成
- `Scripts` 是目录
- 子文件名使用 `Script.name`
- 文件内容使用 YAML Front Matter
- `name` 由文件名提供，不进入文件内容
- `content` 作为 front matter 之后的正文内容
- 除 `name` 和 `content` 外，其余字段都放在头部 YAML 块中
- `Read` 时输出完整的 `front matter + body`
- `Write` / `Edit` 针对“映射成 YFM 之后的完整文本”进行
- 对不存在的 `Scripts/<name>` 执行 `Write` 视为新建
- `Delete` 删除对应的脚本项
- `Delete` 的 rollback 通过同一路径重新 `Write` 完整 YFM 文本恢复

头部字段直接对应 [script.d.ts](../@types/function/script.d.ts) 中的 `Script`：

- 去掉由文件名提供的 `name`
- 去掉由正文提供的 `content`
- 其余字段全部进入 front matter

如果多个脚本具有相同 `name`，则该路径视为冲突路径：

- `list()` 仍可报告冲突名
- `getChild()` / `read()` / `write()` 对该名字应返回冲突错误

### Script 文件的 `Write` / `Edit` 语义

`Scripts/<name>` 的 `Write` 和 `Edit` 都以“映射后的完整文本文件”为对象，也就是：

- 行号、offset、limit 都针对完整 YFM 文本计算
- `Edit` 替换的是完整文本中的字符串，而不是某个单独字段
- 保存时再把文本反序列化回 `Script`

`Write` 需要区分 `Create` 和 `Update`：

- `Update`:
  - 如果文本不含 front matter，仍然接受
  - 如果 front matter 存在但无效，仍然接受
  - 但返回结果中要给出 warning
  - 缺失头部时 warning 为 `Front Matter Missing`
  - 头部无效时 warning 为 `Invalid Front Matter,Ignored`
- `Create`:
  - 允许完全缺失 front matter
  - front matter 若存在，则必须合法
  - 如果 front matter 存在但无效，直接报错
  - 错误信息要明确指出头部不符合 schema
  - 如果 front matter 完全缺失，则使用一组默认头部字段创建对象

当 `Update` 发生 “Front Matter Missing” 或 “Invalid Front Matter,Ignored” 时：

- `content` 取整个文本正文
- 头部字段回退为旧 script 对象中的原值
- `name` 仍由文件名提供

当 `Create` 发生 “Front Matter Missing” 时：

- `content` 取整个文本正文
- `name` 由文件名提供
- 其余字段使用默认值填充
- 生成出的完整对象仍必须通过 `Script` 结构校验

## 软链接语义

为支持 `WorldBook`，Node FS 需要补充软链接节点语义：

```ts
export type NodeKind = 'directory' | 'file' | 'symlink';

export interface SymlinkNode extends Node {
  stat(): Promise<NodeStat & { kind: 'symlink' }>;
  readlink(): Promise<string>;
}
```

约束：

- 软链接目标路径必须是绝对虚拟路径
- `WorldBook` 只允许指向 `/Worldbooks/<name>`
- 非递归 `list()` 只返回软链接节点本身
- 递归遍历和 `**/*` 需要先产出软链接节点，再进入其目标目录继续遍历
- 递归跟随软链接时必须做防环处理

## Glob 与遍历

`glob` / `walk` 的逻辑路径保持不变，即从调用方看到的路径继续向下展开。

例如角色 `Alice` 绑定世界书 `设定集` 时：

- `list('/Characters/Alice')` 中包含 `WorldBook`
- `glob('/Characters/Alice', '*')` 输出 `/Characters/Alice/WorldBook/`
- `glob('/Characters/Alice', '**/*')` 需要同时输出：
  - `/Characters/Alice/WorldBook/`
  - `/Characters/Alice/WorldBook/...` 下的世界书内容

这里返回值始终是逻辑路径，不直接把目标路径编码进 glob 字符串。
`read` / `write` / `grep` / `delete` 等实际访问在进入 `WorldBook/...` 后应解引用到对应的 Worldbook 子树。
目录在 glob 结果中始终以带尾斜杠的形式返回；无尾斜杠路径只表示文件。

## 视图与生命周期

角色目录也采用与世界书类似的“单次操作视图”策略。

```ts
export interface CharacterView {
  characterName: string;
  character: Character;
  worldbookTargetPath: string | null;
  regexByName: Map<string, TavernRegex>;
  regexConflicts: Set<string>;
  scriptsByName: Map<string, Script>;
  scriptConflicts: Set<string>;
}
```

约束：

- `CharacterNode` 只在当前一次操作中有效，不缓存 `list()` 结果
- `CharacterNode` 在 `getChild()` / `list()` 时 lazy 打开 `CharacterView`
- `CharacterDescriptionNode`、`CharacterFirstMessageNode`、`CharacterRegexNode`、`CharacterWorldbookLinkNode` 都绑定到单次 `CharacterView`
- `CharacterScriptNode` 也绑定到单次 `CharacterView`
- 不做跨操作缓存

生命周期分层：

- 长期有效：只有 `RootNode`
- 单次操作有效：`LorebooksRootNode`、`CharactersRootNode`、`CharacterNode`、`CharacterDescriptionNode`、`CharacterFirstMessageNode`、`CharacterRegexNode`、`CharacterScriptNode`、`CharacterWorldbookLinkNode`
- 绑定到 node：`CharacterView`

语义说明：

- `CharacterNode` 与 Worldbook 侧的 `LorebookNode` 一样，只在一次路径解析、遍历或工具调用中保持自洽
- `CharacterView` 绑定到触发它的 node 与该次操作，不跨操作复用
- 同一路径在不同操作中解析出的 `CharacterNode` 不要求对象身份相同

## 建议新增的节点类型

- `LorebooksRootNode`: 承接现有 Worldbook 根目录逻辑
- `CharactersRootNode`: 列出角色卡名称
- `CharacterNode`: 单个角色卡目录
- `CharacterDescriptionNode`: `Description.md`
- `CharacterWorldbookLinkNode`: `WorldBook` 软链接
- `CharacterFirstMessagesDirectoryNode`: `FirstMessages`
- `CharacterFirstMessageNode`: `FirstMessages/<index>`
- `CharacterRegexDirectoryNode`: `Regex`
- `CharacterRegexNode`: `Regex/<script_name>`
- `CharacterScriptsDirectoryNode`: `Scripts`
- `CharacterScriptNode`: `Scripts/<name>`

`RootNode` 改为组合根，只负责返回固定子目录 `Worldbooks` 和 `Characters`。

## 关键函数

### 根与目录绑定

```ts
function isSafePathSegment(name: string): boolean;
function createRootNode(): RootNode;
function createLorebooksRootNode(): LorebooksRootNode;
function createCharactersRootNode(): CharactersRootNode;
```

- `isSafePathSegment()` 统一过滤不能直接暴露为路径段的名字
- `createRootNode()` 负责把两类根节点挂到 `/`

### 角色视图

```ts
async function openCharacterView(characterName: string): Promise<CharacterView>;
function resolveCharacterWorldbookTargetPath(character: Character): string | null;
function buildCharacterRegexIndex(character: Character): {
  regexByName: Map<string, TavernRegex>;
  regexConflicts: Set<string>;
};
function buildCharacterScriptIndex(character: Character): {
  scriptsByName: Map<string, Script>;
  scriptConflicts: Set<string>;
};
```

- `openCharacterView()` 统一调用 `getCharacter()`
- `resolveCharacterWorldbookTargetPath()` 负责把 `character.worldbook` 转成 `/Worldbooks/<name>`
- `buildCharacterRegexIndex()` 负责 regex 名称去重和冲突检测
- `buildCharacterScriptIndex()` 负责脚本名称去重和冲突检测
- `Regex` 和 `Scripts` 的实际读写都统一落到 `Character` 对象更新，不直接调用各自独立的宿主写接口

### 角色文本与数组更新

```ts
async function writeCharacterDescription(characterName: string, content: string): Promise<void>;
async function writeCharacterFirstMessage(characterName: string, index: number, content: string): Promise<void>;
async function deleteCharacterFirstMessage(characterName: string, index: number): Promise<void>;
async function restoreDeletedCharacterFirstMessage(characterName: string, index: number, content: string): Promise<void>;
function parseFirstMessageIndex(name: string): number | null;
```

- 所有写操作都通过 `updateCharacterWith()`
- `parseFirstMessageIndex()` 只接受非负整数字符串
- `writeCharacterFirstMessage()` 需要负责数组扩容
- `restoreDeletedCharacterFirstMessage()` 负责 delete rollback 时按原下标插回

### regex 文件绑定

```ts
function serializeCharacterRegex(regex: TavernRegex): string;
function parseCharacterRegexFile(content: string): {
  frontMatterState: 'valid' | 'missing' | 'invalid';
  attributes: CharacterRegexFrontMatter | null;
  body: string;
  errorMessage?: string;
};
function deserializeCharacterRegex(
  scriptName: string,
  content: string,
  mode: 'create' | 'update',
  previous?: TavernRegex,
): {
  regex: TavernRegex;
  warnings: string[];
};
async function writeCharacterRegex(characterName: string, scriptName: string, content: string): Promise<void>;
async function deleteCharacterRegex(characterName: string, scriptName: string): Promise<void>;
function createDefaultCharacterRegexFrontMatter(): CharacterRegexFrontMatter;
function serializeCharacterScript(script: Script): string;
function parseCharacterScriptFile(content: string): {
  frontMatterState: 'valid' | 'missing' | 'invalid';
  attributes: CharacterScriptFrontMatter | null;
  body: string;
  errorMessage?: string;
};
function deserializeCharacterScript(
  name: string,
  content: string,
  mode: 'create' | 'update',
  previous?: Script,
): {
  script: Script;
  warnings: string[];
};
async function writeCharacterScript(characterName: string, name: string, content: string): Promise<void>;
async function deleteCharacterScript(characterName: string, name: string): Promise<void>;
function createDefaultCharacterScriptFrontMatter(): CharacterScriptFrontMatter;
```

- `serializeCharacterRegex()` 输出稳定的 YAML Front Matter 文本，不包含 `script_name`
- `parseCharacterRegexFile()` 负责切分头部和正文，并判断 `valid / missing / invalid`
- `deserializeCharacterRegex()` 用文件名回填 `script_name`，并按 `create / update` 区分报错或 warning
- `previous` 用于在 update 且头部缺失/无效时回退保留旧字段
- `createDefaultCharacterRegexFrontMatter()` 用于 create 且缺失头部时补默认值
- `serializeCharacterScript()`、`parseCharacterScriptFile()`、`deserializeCharacterScript()` 与 regex 侧保持对称
- `createDefaultCharacterScriptFrontMatter()` 用于 create 且缺失头部时补默认值

### Regex Front Matter Schema

`Regex/<script_name>` 的头部需要有独立 schema，并直接对应 `TavernRegex` 中除 `script_name` / `replace_string` 外的字段。

```ts
const characterRegexFrontMatterSchema = z.object({
  id: z.string(),
  enabled: z.boolean(),
  find_regex: z.string(),
  trim_strings: z.array(z.string()),
  source: z.object({
    user_input: z.boolean(),
    ai_output: z.boolean(),
    slash_command: z.boolean(),
    world_info: z.boolean(),
  }),
  destination: z.object({
    display: z.boolean(),
    prompt: z.boolean(),
  }),
  run_on_edit: z.boolean(),
  min_depth: z.number().int().nullable(),
  max_depth: z.number().int().nullable(),
});

type CharacterRegexFrontMatter = z.infer<typeof characterRegexFrontMatterSchema>;
```

约束：

- front matter schema 直接对应 [tavern_regex.d.ts](../@types/function/tavern_regex.d.ts) 中 `TavernRegex` 去掉 `script_name` 和 `replace_string` 后的字段
- 对外始终按 `TavernRegex` 结构校验，而不是按更宽松的宿主存储结构透传
- 创建时 front matter 若存在则必须通过该 schema 校验；完全缺失时使用默认值
- 更新时若校验失败，则允许继续保存正文，但返回 warning

### Script Front Matter Schema

`Scripts/<name>` 的头部需要有独立 schema，并直接对应 `Script` 中除 `name` / `content` 外的字段。

```ts
const characterScriptFrontMatterSchema = z.object({
  type: z.literal('script'),
  enabled: z.boolean(),
  id: z.string(),
  info: z.string(),
  button: z.object({
    enabled: z.boolean(),
    buttons: z.array(
      z.object({
        name: z.string(),
        visible: z.boolean(),
      }),
    ),
  }),
  data: z.record(z.string(), z.any()),
});

type CharacterScriptFrontMatter = z.infer<typeof characterScriptFrontMatterSchema>;
```

约束：

- front matter schema 直接对应 [script.d.ts](../@types/function/script.d.ts) 中 `Script` 去掉 `name` 和 `content` 后的字段
- 对外始终按 [script.d.ts](../@types/function/script.d.ts) 中的 `Script` 结构校验，不接受底层宽类型直接透传
- 创建时 front matter 若存在则必须通过该 schema 校验；完全缺失时使用默认值
- 更新时若校验失败，则允许继续保存正文，但返回 warning

### 软链接遍历

```ts
async function resolveSymlinkTarget(node: SymlinkNode): Promise<Node | null>;
async function* walkDirectory(node: DirectoryNode, options?: {
  followSymlinkDirectories?: boolean;
}): AsyncIterable<Node>;
```

- `walkDirectory()` 默认应开启目录软链接跟随
- 跟随时要维护递归栈中的目标路径集合，避免循环
- `glob()` 建立在这个 `walkDirectory()` 之上

## 对现有实现的影响

- `src/wtc/node_fs/root_node.ts` 需要从“列世界书”改成“列固定子目录”
- 现有 Worldbook 子树整体迁入 `/Worldbooks`
- `src/wtc/actions/read.ts`、[glob.ts](../src/wtc/actions/glob.ts)、[grep.ts](../src/wtc/actions/grep.ts) 等动作层不能再依赖 `parseVirtualPath()` 中的 `worldbookName`
- 权限判断要从“按单本 Worldbook 或单个 Character 根目录授权”来做，而不是按旧的一层根目录假设
- 通过 `/Characters/<name>/WorldBook/...` 访问世界书时，仍应落到目标 Worldbook 的权限检查
- `glob()` 不再对 `/` 单独实现；根目录与其他目录一样通过 `resolveDirectoryNode() + walkDirectory()` 统一遍历
- `deleteRollback()` 采用 node 提供的删除前快照；`FirstMessages` 需要专门的“按下标插回”恢复策略

## 当前阶段不做的事

- 不把完整角色对象平铺成大量 JSON 文件
- 不在 `CharacterNode` 上直接暴露通用 `getattr/setattr`
- 不把角色头像、`creator_notes`、`extensions.tavern_helper` 等字段纳入第一版文件树
- 不做跨操作缓存
