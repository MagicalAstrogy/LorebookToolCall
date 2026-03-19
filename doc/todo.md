# 世界书读写工具

## 目标
提供一组可供 LLM 在推理过程中调用的工具接口，用来读写 SillyTavern 世界书，减少用户手动打开世界书编辑器的需求。

本期目标不是做一个完整文件管理器，而是提供一层稳定、可预测、可授权的世界书访问抽象。

## 参考
- 工具调用格式参考 [reference.json](./reference.json)
- 项目结构和脚本组织方式参考 `/mnt/h/VariableUpdate`
- 世界书高层类型以 `@types/function/worldbook.d.ts` 中的 `WorldbookEntry` 为准

## 本期设计决策

### 工具集合

v1 暴露以下工具：

- `Glob`
- `Grep`
- `Read`
- `Edit`
- `Write`
- `Delete`
- `CreateLorebook`
- `AskUserQuestion`
- `GetAttribute`
- `SetAttribute`

约束如下：

- 不提供“删除世界书”工具
- 创建世界书使用单独的 `CreateLorebook`
- 删除条目由 `Delete` 负责
- `List` 不单独提供，由 `Glob` 承担

### 文件系统抽象

#### 总体模型

- `Lorebook` 与 `Worldbook` 视为同义词
- 虚拟文件系统只映射“世界书条目”
- 虚拟路径格式为：

```text
/
/<LorebookName>
/<LorebookName>/<EntryPath>
```

- `/` 是根目录，只包含世界书
- `/<LorebookName>` 表示某个世界书
- `/<LorebookName>/<EntryPath>` 表示某个条目

#### 路径归一化

所有工具都先对输入路径做标准文件系统式归一化，归一化后的结果才参与后续操作。

规则按 POSIX 路径处理：

- 路径必须是绝对路径
- 合并重复 `/`
- 消解 `.` 段
- 消解 `..` 段
- 不能越过根目录 `/`
- 根路径固定为 `/`

可直接理解为 `path.posix.normalize()` 的行为，再叠加“必须是绝对路径”的约束。

示例：

- `//Book///A` 归一化为 `/Book/A`
- `/Book/./A` 归一化为 `/Book/A`
- `/Book/X/../A` 归一化为 `/Book/A`
- `/Book/../../A` 归一化为 `/A`

#### 世界书名与条目路径

- 世界书名必须与 SillyTavern 中真实名称完全匹配
- 如果某个世界书名称本身包含 `/`，则该世界书不暴露给工具层
- 条目的 `comment` 字段映射为 `EntryPath`
- 对条目而言，使用 `comment` 归一化后的路径参与匹配

### 同名路径与目录语义

#### 冲突条目

如果同一世界书中，多个条目在路径归一化后得到同一个文件路径，则视为冲突。

冲突时：

- 任何基于该路径的精确操作直接失败
- 统一返回错误信息：

```text
出现同名条目，请要求 user 变更对应条目名。
```

- 错误码定义为 `PATH_CONFLICT`

#### 目录与同名文件并存

世界书允许同时存在：

- 条目 `Folder`
- 条目 `Folder/Content`

这会在虚拟文件系统里形成：

- 文件 `/Book/Folder`
- 目录 `/Book/Folder`

这里按“正常文件系统操作语义”处理，而不是单纯依赖字符串尾斜杠：

- 文件类工具按文件解释路径：
  - `Read`
  - `Write`
  - `Edit`
  - `Delete`
  - `GetAttribute`
  - `SetAttribute`
- 目录类工具按目录解释路径：
  - `Glob`
  - `Grep`

#### `Glob` 示例

假设世界书 `设定集` 内存在两个条目：

- `Folder`
- `Folder/Content`

则：

```ts
Glob({ path: "/设定集", pattern: "*" })
```

返回中应同时体现：

- `/设定集/Folder` 作为 `file`
- `/设定集/Folder/` 作为 `directory`

进一步：

```ts
Read({ file_path: "/设定集/Folder" })
```

应读取条目 `Folder` 的内容。

```ts
Glob({ path: "/设定集/Folder", pattern: "*" })
```

应列出虚拟目录 `Folder` 下的内容，即 `Content`。

因此，`Glob` 的返回值中目录统一带尾斜杠，仅用于结果展示和去歧义；但输入路径会先做普通路径归一化，再根据工具类型解释为“文件”或“目录”。

### 属性范围

- 只有条目有 Attribute
- 世界书目录本身没有 Attribute
- `GetAttribute` 直接返回 `WorldbookEntry`
- `SetAttribute` 直接接收 `WorldbookEntry` 的子集

也就是说，虽然工具名叫 Attribute，但对外结构直接复用 `WorldbookEntry`，不再额外定义一套字段名。

### `SetAttribute` 语义

`SetAttribute` 是 lossy patch：

- 所有字段都是 optional
- 只对提供的字段进行修改
- 未提供的字段保持原值

对嵌套对象的约定：

- 对象字段递归合并
- 数组字段整体替换
- 标量字段直接覆盖

例如：

```ts
SetAttribute({
  file_path: "/设定集/NPC/理理",
  attributes: {
    enabled: false,
    position: {
      depth: 4,
    },
  },
})
```

表示：

- 修改 `enabled`
- 仅修改 `position.depth`
- `position` 的其他字段保持不变
- 其他顶层字段保持不变

如果 patch 中包含 `comment`，则等价于修改条目路径；修改后的归一化路径若与其他条目冲突，则返回 `PATH_CONFLICT`。

## 工具语义

所有工具都返回 JSON 字符串。

成功时直接返回对应工具的结果对象：

- `Glob` / `Grep` / `Read` / `Edit` / `Write` 返回结构化结果对象
- `Delete` / `CreateLorebook` / `AskUserQuestion` / `GetAttribute` / `SetAttribute` 也返回各自结果对象

所有工具在失败场景下都必须返回完全统一的错误结构：

```ts
{
  is_error: true;
  errorType: string;
  message: string;
  details?: Array<{
    expected: string;
    received: string;
    path?: string[];
  }>;
}
```

统一约定：

- 业务错误时，`errorType` 使用下文定义的错误码
- 参数校验错误时，`errorType` 使用 `InputValidationError`
- `message` 直接给模型可读文本
- `details` 仅在确实有结构化补充信息时返回
- 路径无效类错误的 `details` 格式统一为：

```ts
{
  expected: "合法的虚拟路径";
  received: string;
  path: ["file_path"];
}
```

若对应参数不是 `file_path`，则 `path` 改为对应的参数名数组

至少定义以下错误码：

- `INVALID_PATH`
- `WORLD_NOT_FOUND`
- `WORLD_ALREADY_EXISTS`
- `ENTRY_NOT_FOUND`
- `PATH_IS_DIRECTORY`
- `PATH_CONFLICT`
- `TEXT_NOT_FOUND`
- `PERMISSION_DENIED`
- `USER_REJECTED`
- `CONTENT_TOO_LARGE`

`StructuredPatch` 结构定义如下：

```ts
interface StructuredPatch {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
}
```

其中：

- `lines` 采用 unified diff 风格
- 以 `+` 开头表示新增行
- 以 `-` 开头表示删除行
- 以空格开头表示上下文行

### `Glob`

签名：

```ts
{
  pattern: string;
  path?: string;
}
```

约定：

- `pattern` 必填
- `path` 省略时默认等价于根目录 `/`
- `path = "/"` 时列世界书
- `path = "/<LorebookName>"` 或其子目录时列该目录下内容
- 返回格式：

```ts
{
  filenames: string[];
  durationMs: number;
  numFiles: number;
  truncated: boolean;
}
```

补充约定：

- 目录项在 `filenames` 中保留尾斜杠，例如 `/设定集/Folder/`
- 文件项不带尾斜杠，例如 `/设定集/Folder`
- `numFiles` 表示总匹配数，不受截断影响
- `truncated` 表示结果是否因数量限制被截断
- 这里沿用 `filenames` 字段名，不再额外返回 `type`；目录/文件区分通过尾斜杠完成

### `Grep`

签名：

```ts
{
  pattern: string;
  path: string;
  glob?: string;
  type?: string;
  output_mode?: "content" | "files_with_matches" | "count";
  "-B"?: number;
  "-A"?: number;
  "-C"?: number;
  context?: number;
  "-n"?: boolean;
  "-i"?: boolean;
  head_limit?: number;
  offset?: number;
  multiline?: boolean;
}
```

约定：

- `Grep` 不允许跨世界书搜索
- `path` 不能是 `/`
- `path` 必须落在某一个确定的世界书内
- 只搜索 `content`
- 不搜索属性字段
- 返回格式：

`files_with_matches` 模式：

```ts
{
  mode: "files_with_matches";
  filenames: string[];
  numFiles: number;
  appliedLimit?: number;
}
```

`content` 模式：

```ts
{
  mode: "content";
  content: string;
}
```

`count` 模式：

```ts
{
  mode: "count";
  numFiles: number;
  filenames: string[];
  content: string;
}
```

补充约定：

- `content` 字段格式保持 ripgrep 兼容风格
- 匹配行使用 `file-path:line-number:content`
- 上下文行使用 `file-path-line-number-content`
- 不同匹配块之间用 `--` 分隔
- `file-path` 使用虚拟路径而不是磁盘路径
- `head_limit` 生效时，`files_with_matches` 模式返回 `appliedLimit`

### `Read`

签名：

```ts
{
  file_path: string;
  offset?: number;
  limit?: number;
}
```

约定：

- `file_path` 必须是绝对路径
- 只能读取条目，不可读取目录
- `file_path` 必须指向 `/<LorebookName>/<EntryPath>`，不能直接指向 `/<LorebookName>`
- 支持对长内容分段读取
- 默认 `offset = 0`、`limit = 0`
- 返回格式：

```ts
{
  type: "text";
  file: {
    filePath: string;
    content: string;
    numLines: number;
    startLine: number;
    totalLines: number;
  };
}
```

补充约定：

- `offset` 从 `0` 开始计数，表示跳过前多少行后再返回，默认值为 `0`
- `limit` 表示本次最多返回多少行，默认值为 `0`，表示不限制行数
- `file.content` 使用 `cat -n` 风格，每行格式为 `空格 + 行号 + \t + 行内容`
- `filePath` 回显归一化后的虚拟路径
- `startLine` 等于请求的 `offset + 1`
- `numLines` 为本次实际返回的行数
- 若内容过长，模型继续使用 `offset` / `limit` 分段读取；不再额外返回 `has_more`
- 若未指定 `limit`，且本次将返回的总字符数大于 `5000`，则返回 `CONTENT_TOO_LARGE`
- 若 `file_path` 直接指向世界书本身而非条目，则返回 `InputValidationError`
- 若 `offset < 0`、`limit < 0` 或参数类型不合法，则返回 `InputValidationError`
- 此时 `details` 中应指出具体出错参数，例如 `offset` 或 `limit`

### `Write`

签名：

```ts
{
  file_path: string;
  content: string;
}
```

约定：

- `file_path` 必须指向 `/<LorebookName>/<EntryPath>`，不能直接指向 `/<LorebookName>`
- 对已有条目，直接覆盖 `content`
- 对不存在的条目，新建条目
- 新建条目的 `comment` 由归一化后的 `file_path` 去掉 `/<LorebookName>/` 前缀后推导
- 其余字段使用默认值
- 返回格式：

```ts
{
  type: "create" | "update";
  filePath: string;
  content: string;
  structuredPatch: StructuredPatch[];
  originalFile: string | null;
}
```

补充约定：

- `content` 为写入后的完整纯文本内容，不带行号前缀
- 新建条目时：
  - `type = "create"`
  - `originalFile = null`
  - `structuredPatch = []`
- 更新已有条目时：
  - `type = "update"`
  - `originalFile` 为修改前的完整内容
  - `structuredPatch` 为本次变更对应的结构化补丁

### `Edit`

签名：

```ts
{
  file_path: string;
  old_string: string;
  new_string: string;
  replace_all?: boolean;
}
```

约定：

- `file_path` 必须指向 `/<LorebookName>/<EntryPath>`，不能直接指向 `/<LorebookName>`
- 只作用于条目 `content`
- 默认只替换一次
- 未命中时返回 `TEXT_NOT_FOUND`
- 如果 `old_string` 命中多处且未指定 `replace_all: true`，返回错误，避免不确定修改
- 返回格式：

```ts
{
  filePath: string;
  oldString: string;
  newString: string;
  originalFile: string | null;
  structuredPatch: StructuredPatch[];
  userModified: boolean;
  replaceAll: boolean;
}
```

补充约定：

- `originalFile` 为修改前的完整条目内容
- `structuredPatch` 为本次替换生成的结构化补丁
- `userModified` 这里固定为 `false`，表示没有额外的人工交互式编辑步骤
- `replaceAll` 回显实际采用的替换策略

### `Delete`

签名：

```ts
{
  file_path: string;
}
```

约定：

- `file_path` 必须指向 `/<LorebookName>/<EntryPath>`，不能直接指向 `/<LorebookName>`
- 只删除条目
- 不删除世界书
- 不删除虚拟目录
- 若 `file_path` 直接指向世界书本身，返回 `InputValidationError`
- 若 `file_path` 指向仅由 `comment` 层级关系推导出的虚拟目录，返回 `InputValidationError`
- 若删除后某虚拟目录为空，该目录自然消失，无需额外操作
- 返回格式：

```ts
{
  filePath: string;
  deleted: true;
}
```

### `CreateLorebook`

签名：

```ts
{
  lorebook_name: string;
}
```

约定：

- 只创建空世界书
- 若世界书已存在，返回 `WORLD_ALREADY_EXISTS`
- 不负责初始化条目
- 返回格式：

```ts
{
  lorebookName: string;
  created: true;
}
```

### `AskUserQuestion`

签名保持简单：

```ts
{
  question: string;
}
```

约定：

- 内部通过 `SillyTavern.callGenericPopup` 展示
- 返回用户输入文本
- 用户主动提交空字符串时，仍视为成功，返回 `answer: ""`
- 用户取消、关闭或明确拒绝输入时，返回 `USER_REJECTED`
- 权限确认不通过该工具实现，而由权限层自动处理
- 返回格式：

```ts
{
  question: string;
  answer: string;
}
```

### `GetAttribute`

签名：

```ts
{
  file_path: string;
}
```

返回格式：

```ts
{
  filePath: string;
  attributes: WorldbookEntry;
}
```

说明：

- `file_path` 必须指向 `/<LorebookName>/<EntryPath>`，不能直接指向 `/<LorebookName>`
- 直接返回条目当前的 `WorldbookEntry`
- 不单独裁剪字段
- 普通内容编辑仍优先使用 `Read` / `Write` / `Edit`

### `SetAttribute`

签名：

```ts
{
  file_path: string;
  attributes: WorldbookEntryPatch;
}
```

其中：

```ts
interface WorldbookEntryPatch {
  // 与 WorldbookEntry 字段集合相同，但不包含 comment
  // 所有字段均为 optional
  // 对象字段递归 optional
  // 数组字段仍按整体替换处理
}
```

说明：

- `file_path` 必须指向 `/<LorebookName>/<EntryPath>`，不能直接指向 `/<LorebookName>`
- `attributes` 是不包含 `comment` 的 `WorldbookEntry` patch
- 仅修改提供的字段
- 不允许修改 `comment`
- 可修改 `content`，但普通文本修改仍建议优先使用 `Write` / `Edit`
- 返回格式：

```ts
{
  filePath: string;
  attributes: WorldbookEntry;
}
```

## 底层实现

### 为什么直接基于 `loadWorldInfo`

底层实现优先直接使用：

- `loadWorldInfo`
- `saveWorldInfo`

主要理由不是字段名映射，而是避免高层接口内部的 `klona` 深拷贝带来的额外开销。

因此推荐实现一个轻量 adapter：

- 负责 `comment <-> path`
- 负责原始条目对象与 `WorldbookEntry` 的互转
- 但不在中间再做一层完整深拷贝

### 并发写入策略

这里不能只按“JS 单线程”理解，因为工具实现里会发生 `await`，而一旦 `await` 让出执行权，同一世界书上的多个读改写流程就可能交错。

因此对每个世界书都要建立独立的异步串行队列：

- `Write`
- `Edit`
- `Delete`
- `SetAttribute`

这四类操作都必须在对应世界书的队列中执行完整的：

1. 读取最新世界书
2. 定位条目
3. 修改内存对象
4. 调用 `saveWorldInfo`

不能把“读”和“写”拆到两个独立 await 片段之外。

可以理解为每个世界书有一个 promise chain / mutex：

- 新写操作挂到前一个 promise 后面
- 当前操作完整结束后才允许下一个进入

这样能避免：

- 旧读覆盖新写
- 两个 `Edit` 互相丢失修改
- `SetAttribute` 与 `Write` 交叉时内容回退

## 权限设计

### 权限级别

权限仍保留三种：

- 读权限
- 写权限
- 删权限

并满足：

- 删权限隐含写权限
- 写权限隐含读权限

### 授权粒度

- 授权粒度是单个 `/<LorebookName>`
- 任意条目操作都折算为其所属世界书的权限

### 各工具所需权限

- `Glob`
  - 对 `/` 列世界书不需要单独授权
  - 对某个世界书内部列目录需要读权限
- `Grep` 需要读权限
- `Read` 需要读权限
- `GetAttribute` 需要读权限
- `CreateLorebook` 需要写权限
- `Write` 需要写权限
- `Edit` 需要写权限
- `SetAttribute` 需要写权限
- `Delete` 需要删权限
- `AskUserQuestion` 不走世界书权限

补充约定：

- `CreateLorebook` 虽然创建前目标世界书尚不存在，但权限申请目标仍按将要创建的 `/<LorebookName>` 处理

### 授权交互

通过显式弹出 `SillyTavern.callGenericPopup`：

```text
LLM 请求对 '/<LorebookName>' 进行 <操作类型>，是否允许？
```

选项为：

- 允许
- 对 `/<LorebookName>` 目录始终允许
- 拒绝

### 权限缓存边界

由于原设计说明里写的是“全局变量”，因此“始终允许”的作用域就是脚本生命周期：

- 页面刷新后失效
- 脚本卸载后失效
- 重新加载脚本后失效

不做跨会话持久化。

## 推荐实现结构

```text
src/世界书工具/
  index.ts
  tool_registry.ts
  permission.ts
  result.ts
  schema.ts
  store/
    worldbook_adapter.ts
    path_index.ts
    worldbook_queue.ts
  tools/
    glob.ts
    grep.ts
    read.ts
    write.ts
    edit.ts
    delete.ts
    create_lorebook.ts
    ask_user_question.ts
    get_attribute.ts
    set_attribute.ts
```

职责建议：

- `tool_registry.ts`
  - 包装 `registerFunctionTool`
  - 统一处理返回 JSON 和错误格式
- `worldbook_adapter.ts`
  - 直接对接 `loadWorldInfo` / `saveWorldInfo`
  - 做最小必要的字段映射
- `path_index.ts`
  - 路径归一化
  - 目录生成
  - 同名冲突检测
- `worldbook_queue.ts`
  - 每个世界书一个异步串行队列

## 非目标

下面这些内容本期不做：

- 删除世界书
- 世界书重命名
- 跨世界书 `Grep`
- 目录级 Attribute
- 持久化“始终允许”授权
