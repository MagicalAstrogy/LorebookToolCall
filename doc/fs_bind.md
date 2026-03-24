# FS Bind 结论

## 术语与权限边界

对外文档统一使用 `Worldbook`，不再把对外概念写成 `Lorebook`。  
内部实现里如果继续保留 `LorebookNode`、`openLorebookView()` 之类命名，只视为历史代码命名，不影响对外语义。

权限控制的授权粒度固定为两层目录：

- `/Lorebooks/<Name>`
- `/Characters/<Name>`

也就是说：

- 对单本 Worldbook 的读、写、删操作，都折算到 `/Lorebooks/<Name>`
- 对单个角色卡目录下的读、写、删操作，都折算到 `/Characters/<Name>`
- 通过 `/Characters/<Name>/WorldBook/...` 进入绑定的世界书时，实际权限仍应落到目标 `/Lorebooks/<WorldbookName>`

## 根结构

根目录调整为两个固定子目录：

- `/Lorebooks`
- `/Characters`

现有“根即 Worldbook 列表”的实现整体下移到 `/Lorebooks`。  
旧路径：

- `/<WorldbookName>/...`

新路径：

- `/Lorebooks/<WorldbookName>/...`

`/Characters` 映射到角色卡列表。目录名使用角色卡 `name`，只暴露可安全映射为单一路径段的名称；名称中包含 `/`、`.`、`..` 语义的角色卡不进入文件树。

## Characters 目录映射

`/Characters/<CharacterName>` 是一个目录节点，当前只投影以下稳定子结构：

- `/Characters/<CharacterName>/description.md`
- `/Characters/<CharacterName>/WorldBook`
- `/Characters/<CharacterName>/FirstMessages/`
- `/Characters/<CharacterName>/Regex/`

其他角色字段暂不直接投影到文件树，仍通过 `getCharacter()` / `updateCharacterWith()` 在绑定层内部访问。

### `description.md`

- 映射 `character.description`
- 类型是普通文本文件
- `Read` 直接返回描述文本
- `Write` / `Edit` 通过 `updateCharacterWith()` 回写 `description`
- `Delete` 不支持

### `WorldBook`

- 映射 `character.worldbook`
- 当 `character.worldbook === null` 时，不暴露该子节点
- 当存在绑定时，`WorldBook` 是一个目录软链接，目标为 `/Lorebooks/<worldbookName>`
- 软链接本身不保存内容，进入 `WorldBook/...` 时等价于进入目标世界书子树

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

### `Regex`

- 映射 `character.extensions.regex_scripts`
- `Regex` 是目录
- 子文件名使用 `TavernRegex.script_name`
- 文件内容是 `TavernRegex` 去掉 `script_name` 后的 JSON 文本
- `Read` 时序列化输出稳定 JSON
- `Write` / `Edit` 时反序列化 JSON，再把文件名回填为 `script_name`
- `Delete` 删除对应的 regex 项

如果多个 regex 具有相同 `script_name`，则该路径视为冲突路径：

- `list()` 仍可报告冲突名
- `getChild()` / `read()` / `write()` 对该名字应返回冲突错误

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
- `WorldBook` 只允许指向 `/Lorebooks/<name>`
- 非递归 `list()` 只返回软链接节点本身
- 递归遍历和 `**/*` 需要先产出软链接节点，再进入其目标目录继续遍历
- 递归跟随软链接时必须做防环处理

## Glob 与遍历

`glob` / `walk` 的逻辑路径保持不变，即从调用方看到的路径继续向下展开。

例如角色 `Alice` 绑定世界书 `设定集` 时：

- `list('/Characters/Alice')` 中包含 `WorldBook`
- `glob('/Characters/Alice', '*')` 输出 `/Characters/Alice/WorldBook -> /Lorebooks/设定集`
- `glob('/Characters/Alice', '**/*')` 需要同时输出：
  - `/Characters/Alice/WorldBook -> /Lorebooks/设定集`
  - `/Characters/Alice/WorldBook/...` 下的世界书内容

这里左侧路径始终是逻辑路径，右侧 `->` 后面是软链接目标路径。  
`read` / `write` / `grep` 等实际访问在进入 `WorldBook/...` 后应解引用到对应的 Worldbook 子树。

## 视图与生命周期

角色目录也采用与世界书类似的“单次操作视图”策略。

```ts
export interface CharacterView {
  characterName: string;
  character: Character;
  worldbookTargetPath: string | null;
  regexByName: Map<string, TavernRegex>;
  regexConflicts: Set<string>;
}
```

约束：

- `CharacterNode` 只在当前一次操作中有效，不缓存 `list()` 结果
- `CharacterNode` 在 `getChild()` / `list()` 时 lazy 打开 `CharacterView`
- `CharacterDescriptionNode`、`CharacterFirstMessageNode`、`CharacterRegexNode`、`CharacterWorldbookLinkNode` 都绑定到单次 `CharacterView`
- 不做跨操作缓存

生命周期分层：

- 长期有效：只有 `RootNode`
- 单次操作有效：`LorebooksRootNode`、`CharactersRootNode`、`CharacterNode`、`CharacterDescriptionNode`、`CharacterFirstMessageNode`、`CharacterRegexNode`、`CharacterWorldbookLinkNode`
- 绑定到 node：`CharacterView`

语义说明：

- `CharacterNode` 与 Worldbook 侧的 `LorebookNode` 一样，只在一次路径解析、遍历或工具调用中保持自洽
- `CharacterView` 绑定到触发它的 node 与该次操作，不跨操作复用
- 同一路径在不同操作中解析出的 `CharacterNode` 不要求对象身份相同

## 建议新增的节点类型

- `LorebooksRootNode`: 承接现有 Worldbook 根目录逻辑
- `CharactersRootNode`: 列出角色卡名称
- `CharacterNode`: 单个角色卡目录
- `CharacterDescriptionNode`: `description.md`
- `CharacterWorldbookLinkNode`: `WorldBook` 软链接
- `CharacterFirstMessagesDirectoryNode`: `FirstMessages`
- `CharacterFirstMessageNode`: `FirstMessages/<index>`
- `CharacterRegexDirectoryNode`: `Regex`
- `CharacterRegexNode`: `Regex/<script_name>`

`RootNode` 改为组合根，只负责返回固定子目录 `Lorebooks` 和 `Characters`。

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
```

- `openCharacterView()` 统一调用 `getCharacter()`
- `resolveCharacterWorldbookTargetPath()` 负责把 `character.worldbook` 转成 `/Lorebooks/<name>`
- `buildCharacterRegexIndex()` 负责 regex 名称去重和冲突检测

### 角色文本与数组更新

```ts
async function writeCharacterDescription(characterName: string, content: string): Promise<void>;
async function writeCharacterFirstMessage(characterName: string, index: number, content: string): Promise<void>;
async function deleteCharacterFirstMessage(characterName: string, index: number): Promise<void>;
function parseFirstMessageIndex(name: string): number | null;
```

- 所有写操作都通过 `updateCharacterWith()`
- `parseFirstMessageIndex()` 只接受非负整数字符串
- `writeCharacterFirstMessage()` 需要负责数组扩容

### regex 文件绑定

```ts
function serializeCharacterRegex(regex: TavernRegex): string;
function deserializeCharacterRegex(scriptName: string, content: string, previous?: TavernRegex): TavernRegex;
async function writeCharacterRegex(characterName: string, scriptName: string, content: string): Promise<void>;
async function deleteCharacterRegex(characterName: string, scriptName: string): Promise<void>;
```

- `serializeCharacterRegex()` 输出稳定 JSON，且不包含 `script_name`
- `deserializeCharacterRegex()` 用文件名回填 `script_name`
- `previous` 用于保留旧对象中不在 JSON 投影范围内、但仍需稳定保留的字段

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
- 现有 Worldbook 子树整体迁入 `/Lorebooks`
- `src/wtc/actions/read.ts`、[glob.ts](/mnt/h/LorebookToolCall/src/wtc/actions/glob.ts)、[grep.ts](/mnt/h/LorebookToolCall/src/wtc/actions/grep.ts) 等动作层不能再依赖 `parseVirtualPath()` 中的 `worldbookName`
- 权限判断要从“按单本 Worldbook 或单个 Character 根目录授权”来做，而不是按旧的一层根目录假设
- 通过 `/Characters/<name>/WorldBook/...` 访问世界书时，仍应落到目标 Worldbook 的权限检查

## 当前阶段不做的事

- 不把完整角色对象平铺成大量 JSON 文件
- 不在 `CharacterNode` 上直接暴露通用 `getattr/setattr`
- 不把角色头像、`creator_notes`、`extensions.tavern_helper` 等字段纳入第一版文件树
- 不做跨操作缓存
