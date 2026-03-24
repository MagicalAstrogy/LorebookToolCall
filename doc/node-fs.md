# Node FS 结论

## 术语

对外文档统一使用 `Worldbook`。  
本文中保留 `LorebookNode`、`LorebookEntryNode`、`LorebookView` 等名字，仅用于指代当前代码中的内部实现类型。

## 定位

项目内部使用 node 树抽象世界书访问行为，而不是以路径式 VFS 作为核心模型。

- 根对象是一个目录节点
- 世界书是目录节点
- 世界书条目是文件节点
- 只读说明文件或静态资源也可以作为文件节点接入
- 路径访问、遍历、glob 都建立在 node 树之上

## 核心类型

```ts
export type NodeKind = 'directory' | 'file';

export interface NodeStat {
  // 节点的绝对完整路径。
  path: string;
  // 节点在父目录中的局部名字。
  kind: NodeKind;
  name: string;
  readable: boolean;
  writable: boolean;
}

export interface Node {
  stat(): Promise<NodeStat>;
}
```

结论：

- `NodeStat.path` 固定表示绝对完整路径
- 局部路径不放在 `stat()` 中
- 当前目录下的局部名字由 `NodeStat.name` 表示
- 若后续确实需要相对路径，应由遍历或展示层按 base path 单独计算

## 目录节点

目录节点负责提供子节点访问与挂载能力。

```ts
export interface DirectoryNode extends Node {
  stat(): Promise<NodeStat & { kind: 'directory' }>;

  getChild(name: string): Promise<Node | null>;
  list(): AsyncIterable<Node>;

  mount?(name: string, node: Node): Promise<void> | void;
}
```

约束：

- `mount` 是目录专有行为
- 挂载目标是某个子节点名
- 被挂载对象可以是文件节点，也可以是目录节点
- 当前阶段只有根目录需要考虑挂载能力，`LorebookNode` 不提供 `mount`

## 文件节点

文件节点统一包含读取、覆盖写入和精确编辑能力。

```ts
export interface TextFilePatch {
  oldString: string;
  newString: string;
  replaceAll?: boolean;
}

export interface TextFileNode extends Node {
  stat(): Promise<NodeStat & { kind: 'file' }>;

  read(opts?: { offset?: number; limit?: number }): Promise<string>;
  write(content: string): Promise<void>;
  edit(patch: TextFilePatch): Promise<void>;
}
```

## 属性能力

属性能力单独建模，不与文件正文接口混合。

```ts
export interface AttributeNode extends Node {
  getattr(): Promise<Record<string, unknown>>;
  setattr?(patch: Record<string, unknown>): Promise<void>;
}
```

## 项目内的节点映射

### `RootNode`

实现：

- `DirectoryNode`

作用：

- 作为整个树的根节点
- 子节点通常是 `LorebookNode`
- 也允许挂载其他目录或只读文件

### `LorebookNode`

实现：

- `DirectoryNode`

作用：

- 表示单本世界书
- 子节点可以是子目录，也可以是 `LorebookEntryNode`
- 不提供 `mount`
- 目录占据路径名；如果某个条目路径同时也是目录前缀，则该条目不会作为可见文件暴露，但会被计入文件语义冲突

### `LorebookEntryNode`

实现：

- `TextFileNode`
- `AttributeNode`

作用：

- 读取条目正文
- 覆盖写入条目正文
- 执行精确文本编辑
- 读取和更新条目属性

## View 与节点生命周期

单本世界书的目录遍历不直接建立在宿主对象上，而是先打开一次操作范围内的有序视图 `view`。

```ts
export interface LorebookView {
  lorebookName: string;
  files: IndexedEntry[];
  directories: string[];
  exactFiles: Map<string, IndexedEntry>;
  conflicts: Set<string>;
}
```

约束：

- `LorebookNode` 负责生成 `view`
- `list()` 的结果不缓存
- 同一次遍历、`resolve`、`walk`、`glob` 可以共享同一个 `view`
- 不做跨操作的 `view` 复用

生命周期分层：

- 长期有效：只有 `RootNode`
- 单次操作有效：`LorebookNode`、`VirtualDirectoryNode`、`LorebookEntryNode`
- 绑定到 node：`LorebookView`

语义说明：

- “长期有效”表示可以跨多次 `glob`、`resolve`、`read`、`walk` 操作复用
- “单次操作有效”表示对象只保证在一次 `glob`、`resolve`、`walk`、`grep` 或单次工具调用内自洽
- “绑定到 node”表示对象不是独立暴露给外部的稳定实体，而是某个 node 的内部运行时状态

进一步约束：

- `LorebookNode` 不应被视为稳定持久对象；它只在当前一次路径解析或遍历过程中有效
- `VirtualDirectoryNode` 与 `LorebookEntryNode` 都绑定到某一次单次操作中的 `view`
- `LorebookView` 绑定到发起它的 node 及该次操作上下文，不跨操作复用
- 同一路径在不同操作中解析出的 node 不要求对象身份相同

表示方式：

- `VirtualDirectoryNode` = `view + directoryPrefix`
- `LorebookEntryNode` = `view + indexedEntry`

### 只读文件节点

实现：

- 只读版本的 `TextFileNode`
- 如有需要，可额外实现只读 `AttributeNode`

作用：

- 承载静态说明文件
- 承载生成但不允许修改的系统文件

## 路径解析

路径解析是建立在 node 树之上的辅助过程，不是核心模型本身。

```ts
export async function resolve(root: DirectoryNode, path: string): Promise<Node | null> {
  const parts = normalizePath(path);
  let current: Node = root;

  for (const part of parts) {
    if (!(await isDirectoryNode(current))) {
      return null;
    }
    const next = await current.getChild(part);
    if (!next) {
      return null;
    }
    current = next;
  }

  return current;
}
```

约束：

- 目录路径解析只依赖 `RootNode + getChild()`
- 路径树中每个名字只对应一个可见节点
- 如果底层存在“文件路径与目录路径同名”，则目录优先，文件不会作为可见节点参与层级解析
- 这类同名文件仍要计入文件语义冲突；对该路径做文件访问或写入时应返回冲突错误
- 这类文件不参与 `getChild()`、`list()`、`walk()`、`glob()`

## 遍历

遍历是建立在目录节点 `list()` 之上的辅助算法。

```ts
export async function* walk(node: DirectoryNode): AsyncIterable<Node> {
  for await (const child of node.list()) {
    yield child;
    if (await isDirectoryNode(child)) {
      yield* walk(child);
    }
  }
}
```

## Glob

`glob` 不是 node 的最小能力，而是建立在 `list()/walk()` 之上的辅助能力。

支持：

- `*` 匹配当前目录下一层
- `**/*` 递归匹配所有后代节点

返回结果应直接返回命中的 node 或命中节点的路径信息，不使用尾斜杠区分目录，目录类型由 `stat().kind` 判断。

## 现阶段执行结论

- 移除以 VFS 为核心的设计
- 以 node 树作为统一抽象
- `DirectoryNode` 负责子节点访问与挂载
- `TextFileNode` 同时承担读、写、编辑正文能力
- `AttributeNode` 单独承担属性访问能力
- `LorebookEntryNode` 同时实现 `TextFileNode` 和 `AttributeNode`
- 路径解析、遍历、glob 都作为 node 树上的辅助算法实现
