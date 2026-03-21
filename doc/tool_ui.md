# Tool Call UI Vue 化计划

## Summary
目标是在 `TOOL_CALLS_RENDERED` 事件触发后，定位对应消息里的 `.mes_text details > pre`，对“数组内包含任意已知工具调用”的代码块进行 Vue 替换渲染，并为每个 `pre` 独立管理挂载、更新与销毁生命周期。

已确认决策：

- 宿主使用 `div`
- 单一数据源使用事件回调里的 `invocations`
- 首版只做 `Glob`、`Grep`、`Read`、`Write`、`Edit`、`Delete`、`GetAttribute`、`SetAttribute`
- 未知工具统一回退为 prettified JSON code block
- 首版交互包含：折叠、`soft wrap` 开关、`Edit` 的 `split/unified` 切换、复制行块
- `AskUserQuestion`、`CreateLorebook` 首版不做专用组件
- 本方案允许使用 Tailwind

## Implementation Changes

### 1. 文档与入口

- 新增本文档，作为实现前的统一规格说明
- 新建一个“工具调用楼层 UI”入口，职责只做：
  - 监听 `TOOL_CALLS_RENDERED`
  - 用 `invocations` 找到对应消息节点与目标 `pre`
  - 判断目标块是否命中已知工具
  - 为每个命中的 `pre` 创建独立 Vue 挂载点并隐藏原 `pre`
  - 在消息重渲染、编辑、删除、页面卸载时销毁实例并恢复原 DOM

### 2. 挂载与生命周期

- 参考 `util/streaming.ts` 的状态表与销毁模式，但状态粒度从“message”下沉到“message + pre/tool block”
- 对每个候选 `pre` 建立稳定 key，推荐使用 `messageId + preIndex`
- 首次命中时：
  - 保留原 `pre` 引用
  - 在其前后插入新的宿主 `div`
  - 隐藏原 `pre`
  - 挂载 Vue 实例
- 再次渲染同一块时：
  - 若 key 已存在，则只更新响应式数据，不重复 mount
- 以下情况销毁并恢复原 `pre`：
  - 消息被编辑或重渲染导致原 `pre` 消失
  - 对应消息被删除
  - 页面 `pagehide`
  - 新一轮渲染发现当前块不再命中已知工具
- 多个 `pre` 同屏时，各自独立实例、独立状态；任一块的 wrap/layout/折叠状态不影响其他块

### 3. 数据流与标准化

- 单一数据源为 `TOOL_CALLS_RENDERED` 事件中的 `invocations`
- DOM 只负责定位渲染宿主，不承担业务解析
- 建立统一的工具调用视图模型：
  - 输入为单个 invocation 或同一 `pre` 内的 invocation 数组
  - 标准化出 `toolName`、`parameters`、`result`、`error`、`signature/id`
  - 判断“已知工具”时以数组内任一项命中为准
  - 若数组中含多种工具，则在同一个块内逐项渲染对应组件
- 本地解析失败、字段异常、结果结构不符时，统一走未知工具兜底视图

### 4. 组件拆分

- 每个工具单独一个 Vue 文件组件：
  - `Glob`
  - `Grep`
  - `Read`
  - `Write`
  - `Edit`
  - `Delete`
  - `GetAttribute`
  - `SetAttribute`
  - `UnknownTool`
- 提供共享基础组件或工具函数，避免重复实现：
  - 折叠容器
  - key/value 摘要区
  - 代码视图
  - JSON 视图
  - diff 视图
  - 错误卡片
  - 复制按钮

### 5. 各工具显示规格

#### Glob

- 摘要区显示：`在 ${path ?? "/"} 下搜索 ${pattern}`
- 使用折叠列表列出 `result.filenames`
- 出错时显示统一错误卡片

#### Grep

- 摘要区显示查找条件：
  - `path`
  - `pattern`
  - `glob`
  - `type`
  - `output_mode`
  - `context/-A/-B/-C`
- 使用折叠框显示结果
- `files_with_matches`：
  - 列出 `result.filenames`
- `count`：
  - 输出 `result.content`
- `content`：
  - 将 ripgrep 风格文本解析为结构化行数据
  - 按“文件分组 + 行号列 + 内容列”渲染
- 出错时显示统一错误卡片

#### Read

- 摘要区显示读取条件：
  - `file_path`
  - `offset`
  - `limit`
- 使用折叠框展示 `result.file.content`
- 内容视图采用“行号列 + 内容列”结构，不直接原样显示 `cat -n` 字符串
- 支持 `soft wrap` 开关
- 出错时显示统一错误卡片

#### Write

- 摘要区显示完整路径 `filePath`
- 使用折叠框展示 `result.structuredPatch` 对应内容
- `type === "update"`：
  - 分开列出旧内容和新内容
  - 旧内容来自 `originalFile`
  - 新内容来自 `content`
- `type === "create"`：
  - 仅输出新内容
- 出错时显示统一错误卡片

#### Edit

- 摘要区显示完整路径 `filePath`
- 使用折叠框展示 `result.structuredPatch`
- 采用带行号的 diff 视图
- 支持 `unified` 与 `split` 两种 layout 模式切换
- 支持 `soft wrap` 开关
- 若有 `originalFileNotice`，在正文上方展示提示
- 出错时显示统一错误卡片

#### Delete

- 摘要区显示删除目标 `filePath`
- 正文显示操作结果，如 `deleted: true`
- 出错时显示统一错误卡片

#### GetAttribute

- 摘要区显示读取目标 `filePath`
- 使用折叠框输出 `result.attributes`
- 首版直接使用结构化 JSON 视图
- 出错时显示统一错误卡片

#### SetAttribute

- 摘要区显示：
  - 待写入完整路径 `filePath`
  - 待写入属性值 `parameters.attributes`
- 使用折叠框展示老状态与新状态变化
- 旧状态来源：
  - 由 `backup.rollbackPatch` 反映“本次触达字段的修改前值”
- 新状态来源：
  - `result.attributes`
- 首版只要求“变化列表”，不要求完整对象级 diff 引擎
- 出错时显示统一错误卡片

#### UnknownTool

- 直接输出 prettified JSON
- 表现尽量贴近原本的 code block

### 6. 样式与依赖约束

- 允许使用 Tailwind
- 由于宿主为 `div`，样式必须有明确作用域，避免污染 SillyTavern 原生界面（vue会 mount 进去)
- 禁止复用 `.mes_text` 作为组件根类名，避免影响酒馆编辑行为
- 如需复用现有前端模板或示例，优先参考：
  - `初始模板/流式楼层界面`
  - `示例/流式楼层界面示例`
  - `示例/前端界面示例`

## Test Plan

- 事件包含单个已知工具时，正确替换对应 `pre`
- 同一消息含多个工具块时，每个 `pre` 都能独立挂载和销毁
- 同一 `pre` 内为 invocation 数组且含多个已知工具时，逐项渲染
- 未知工具数组与非预期 JSON 格式时，回退到 JSON 视图
- `Glob` 正确展示路径、pattern、文件列表
- `Grep` 正确覆盖 `files_with_matches`、`count`、`content` 三种模式
- `Read` 正确展示行号、分页内容、`soft wrap` 切换和错误态
- `Write` 正确区分 `create` / `update`
- `Edit` 正确切换 `unified` / `split`，并处理 `originalFileNotice` / 错误态
- `Delete`、`GetAttribute`、`SetAttribute` 正确展示成功和错误结果
- 消息重渲染、编辑、删除、页面离开时实例能正确销毁，不残留隐藏态和孤儿节点
- 同屏多个块反复重渲染时，不重复 mount，不泄漏监听器

## Assumptions

- 当前事件参数 `invocations` 与最终渲染到 `pre` 的 invocation 顺序一致，可用于做 `messageId + preIndex` 级映射
- 首版不处理 `CreateLorebook`、`AskUserQuestion` 的专用卡片
- 首版不做语法高亮搜索、行内跳转等高级交互
- `SetAttribute` 的“旧状态”以 `backup.rollbackPatch` 推导，“新状态”以 `result.attributes` 展示；不要求完整对象级 diff 引擎
- 代码实现阶段优先复用现有 Vue/Tailwind 组织方式，而不是重新设计一套挂载基础设施
