# Preset Mapping 计划

## 目标

把酒馆助手的 Preset 集合挂载到虚拟文件系统 `/Presets` 下。

- `/Presets/<PresetName>` 表示单个 Preset 目录
- `Preset.prompts` 和 `Preset.prompts_unused` 一同映射为该目录下的文件
- `/Presets/Current` 是指向当前加载 Preset 目录的符号链接

这里的文件语义对齐 Worldbook 条目：

- Preset 是目录
- Preset 内的单个 Prompt 是文件

## 路径设计

- `/Presets`
  Preset 根目录。
- `/Presets/<PresetName>`
  单个 Preset 目录。
- `/Presets/<PresetName>/<PromptPath>`
  单个 `PresetPrompt` 文件。
- `/Presets/Current`
  指向当前加载 Preset 目录的符号链接。
- `/Presets/Current/<PromptPath>`
  通过当前 Preset 别名访问 Prompt 文件。

## Prompt 文件映射

单个文件对应一个 `PresetPrompt`。

- `PresetPrompt.name` 映射为文件路径
- `PresetPrompt.content` 映射为文件正文
- 其余字段映射为 YAML Front Matter
- `$schema` 固定写为 `/Schemas/Preset.json`

也就是说，单个 Prompt 文件是 YFM 文本，而不是完整 JSON。

其中：

- `name` 不进入 front matter，由路径提供
- `content` 不进入 front matter，由正文提供
- 条目来自 `prompts` 还是 `prompts_unused` 只由绑定层内部记录，不在文件格式中暴露

## Schema 语义

- `/Schemas/Preset.json` 对应的是 `PresetPrompt` 类型
- 不是整个 `Preset` 类型

Schema 字段应覆盖：

- `id`
- `enabled`
- `position`
- `role`
- `extra`

不包含：

- `name`
- `content`
- `source`

## Preset 名与 Prompt 路径规则

### Preset 名

- Preset 名不支持 `/`
- 只暴露可安全映射为单一路径段的 Preset

### Prompt 路径

- Prompt 使用“像文件一样”的路径语义
- `PresetPrompt.name` 允许包含 `/`
- 因而一个 Prompt 可以映射到多级子路径，例如：
  - `System/Main`
  - `角色/开场白`

这意味着 `/Presets/<PresetName>` 下需要和 Worldbook 一样支持虚拟目录展开。

## prompts 与 prompts_unused 的合并投影

`Preset.prompts` 和 `Preset.prompts_unused` 一同投影到同一棵文件树下。

也就是说：

- 两者不会分成两个顶层子目录
- LLM 看到的是一个统一的 `/Presets/<PresetName>/...` 文件树

绑定层需要记录每个文件来自：

- `prompts`
- `prompts_unused`

这样更新和删除时才能落回正确数组，但这个概念不对外暴露到文件格式。

## 冲突规则

### `prompts` / `prompts_unused` 同名冲突

如果 `prompts` 和 `prompts_unused` 中有两个条目映射到同一路径，则按路径冲突处理。

冲突时：

- `list()` 暴露冲突节点
- `getChild()` 返回冲突文件节点
- `Read` / `Write` / `Edit` / `Delete` 返回 `PATH_CONFLICT`

### 目录占位冲突

如果某个 Prompt 路径同时又是其他 Prompt 的目录前缀，则与 Worldbook 一样按“目录优先、文件冲突”处理。

例如同时存在：

- `A`
- `A/B`

则：

- `A/` 作为目录可见
- 文件语义访问 `A` 返回 `PATH_CONFLICT`

### Current 冲突

如果存在名为 `Current` 的真实 Preset，则 `/Presets/Current` 路径视为冲突路径。

冲突时：

- `list()` 暴露冲突节点
- `getChild()` 返回冲突节点
- `/Presets/Current` 及其下游路径都不进行解引用
- `Read` / `Write` / `Edit` / `Delete` 返回 `PATH_CONFLICT`

## Current 语义

- `Current` 是保留名
- `/Presets/Current` 是目录软链接，而不是普通文件
- 它指向 `getLoadedPresetName()` 返回的 Preset
- 通过 `/Presets/Current/...` 访问时，实际作用到当前加载 Preset 的对应 Prompt 文件
- 返回与回滚使用逻辑路径 `/Presets/Current/...`

## 文件语义

对单个 Prompt 文件：

- `Read` 返回完整 YFM 文本
- `Write` 接收完整 YFM 文本
- `Edit` 基于完整 YFM 文本做精确替换
- `Delete` 删除对应 Prompt 条目

### Create / Update

对不存在路径执行 `Write` 视为创建 Prompt。

创建时：

- 始终写入 `prompts`

对已存在路径执行 `Write` 视为更新。

更新时允许修改：

- `id`
- `enabled`
- `position`
- `role`
- `extra`
- `content`

更新不支持在 `prompts` 与 `prompts_unused` 之间迁移。
也就是说：

- 如果该文件当前来自 `prompts`，更新后仍留在 `prompts`
- 如果该文件当前来自 `prompts_unused`，更新后仍留在 `prompts_unused`
- 不在这一层暴露“把文件移动到 `prompts`”的操作

## 绑定层实现

在 `fs_bind.ts` 增加：

- `getSafePresetNames()`
- `openPresetView()`
- `serializePresetPrompt()`
- `readPresetBoundFile()`
- `writePresetBoundFile()`
- `deletePresetBoundFile()`

其中：

- Preset 名来源于 `getPresetNames()`
- 当前加载 Preset 来源于 `getLoadedPresetName()`
- Preset 内容读取使用 `getPreset(name)`
- 如果某个 Preset 在 `getPreset(name)` 时失败，则直接跳过，不暴露到文件树
- 如果 `getLoadedPresetName()` 指向的 Preset 在 `getPreset()` 时失败，则 `/Presets/Current` 不暴露
- 写回整体仍通过 `replacePreset(name, preset)` / `createPreset(name, preset)` / `deletePreset(name)`
- 绑定层负责把单文件改动重新映射回整个 `Preset`

## Node FS 实现

新增：

- `PresetsRootNode`
- `PresetNode`
- `PresetPromptNode`
- `CreatablePresetPromptNode`
- `PresetVirtualDirectoryNode`
- `CurrentPresetLinkNode`

其中：

- `PresetNode` 类似 `CharacterNode`
- `PresetPromptNode` 类似 `CharacterRegexNode`
- `CreatablePresetPromptNode` 类似 `CreatableCharacterRegexNode`
- `PresetVirtualDirectoryNode` 类似 Worldbook 虚拟目录节点
- `CurrentPresetLinkNode` 类似 `CharacterWorldbookLinkNode`，但目标是 Preset 目录

## 权限语义

- 权限粒度固定为 `/Presets/<PresetName>`
- 对 `/Presets/Current/...` 的授权折算到当前真实 Preset
- `Current` 冲突时不进入授权阶段，直接返回冲突错误

## 测试计划

- 根目录能列出 `/Presets`
- `/Presets/<PresetName>` 能像 Worldbook 一样列出虚拟目录和 Prompt 文件
- `prompts` 与 `prompts_unused` 会一同进入同一棵文件树
- 两数组同名时返回 `PATH_CONFLICT`
- 文件路径与目录前缀冲突时遵循目录优先规则
- `Read` / `Write` / `Edit` / `Delete` 支持单个 Prompt 文件
- 新建文件始终进入 `prompts`
- 更新文件不会在 `prompts` 与 `prompts_unused` 间迁移
- `/Presets/Current` 是目录符号链接
- `/Presets/Current/...` 可正常读写删
- 存在真实 Preset 名 `Current` 时返回 `PATH_CONFLICT`
