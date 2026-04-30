````markdown
## Glob 工具

```typescript
/**
 * Glob 工具返回结果
 */
interface GlobToolResult {
  filenames: string[];    // 匹配的文件路径数组
  durationMs: number;     // 执行耗时（毫秒）
  numFiles: number;       // 文件数量
  truncated: boolean;     // 结果是否被截断（超过限制时为 true）
}
````

**样例：**

```json
{
  "filenames": ["/path/to/file1.jsonl", "/path/to/file2.jsonl"],
  "durationMs": 26,
  "numFiles": 100,
  "truncated": true
}
```

---

## Grep 工具

### files_with_matches 模式

```typescript
/**
 * Grep 工具返回结果 - files_with_matches 模式
 */
interface GrepToolResultFilesMode {
  mode: 'files_with_matches';
  filenames: string[];    // 匹配的文件路径数组
  numFiles: number;       // 文件数量
  appliedLimit?: number;  // 应用的限制数量（当使用 head_limit 时）
}
```

**样例：**

```json
{
  "mode": "files_with_matches",
  "filenames": ["file1.cpp", "file2.cpp", "file3.cpp"],
  "numFiles": 245,
  "appliedLimit": 20
}
```

#### content 模式

```typescript
/**
 * Grep 工具返回结果 - content 模式
 * 返回的 content 格式为：
 * - 匹配行: file-path:line-number:content
 * - 上下文行: file-path-line-number-content (注意分隔符是 - 而非 :)
 * - 不同匹配区域之间以 "--" 行分隔
 */
interface GrepToolResultContentMode {
  mode: 'content';
  content: string;        // 带上下文的匹配内容，采用 ripgrep 输出格式（见下方说明）
  // 注：content 模式下 filenames 和 numFiles 字段可能不存在或为空
}
```

> **`content` 字段格式说明（content 模式）：** 采用 ripgrep 标准输出格式，每行有以下三种之一：
>
> * **匹配行：** `file-path:line-number:行内容`（冒号分隔）
> * **上下文行：** `file-path-line-number-行内容`（短横线分隔，用于 -A/-B/-C 参数产生的上下文）
> * **区域分隔符：** `--`（独立一行，分隔不同匹配区域）

#### count 模式

```typescript
/**
 * Grep 工具返回结果 - count 模式
 * content 格式为 "file-path:count"，每行一个文件
 */
interface GrepToolResultCountMode {
  mode: 'count';
  numFiles: number;       // 匹配的文件数量
  filenames: string[];    // 空数组
  content: string;        // 采用 ripgrep --count 输出格式: "file1:count1\nfile2:count2\n..."
}
```

**样例：**

```json
{
  "mode": "count",
  "numFiles": 244,
  "filenames": [],
  "content": "neko.cpp:7\nmimi.cpp:5\nkitsune.cpp:3\n..."
}
```

#### 联合类型

```typescript
type GrepToolResult = GrepToolResultFilesMode | GrepToolResultContentMode | GrepToolResultCountMode;
```

---

## Read 工具

```typescript
/**
 * Read 工具返回结果
 */
interface ReadToolResult {
  type: 'text';           // 返回类型
  file: {
    filePath: string;     // 文件路径
    content: string;      // 文件内容，采用 cat -n 格式：每行为 "spaces + lineNumber + \t + lineContent"
    numLines: number;     // 读取的行数
    startLine: number;    // 起始行号
    totalLines: number;   // 文件总行数
  };
}
```

> **`content` 字段格式说明：** 内容采用 `cat -n` 格式输出，每行格式为“`    行号\t行内容`”，行号右对齐、前补空格，行号与内容之间以 tab 分隔，行号从 1 开始。

**样例：**

```json
{
  "type": "text",
  "file": {
    "filePath": "/root/MDB-MCP/pyproject.toml",
    "content": "     1\t[project]\n     2\tname = \"gdb-mcp\"\n     3\tversion = \"0.1.0\"\n...",
    "numLines": 37,
    "startLine": 1,
    "totalLines": 37
  }
}
```

---

## Edit 工具

```typescript
/**
 * 结构化补丁块
 */
interface StructuredPatch {
  oldStart: number;       // 原始起始行
  oldLines: number;       // 原始行数
  newStart: number;       // 新起始行
  newLines: number;       // 新行数
  lines: string[];        // 变更行内容，采用 unified diff 格式，以 "+" 开头为新增行，"-" 开头为删除行，" "（空格）开头为上下文行
}

/**
 * Edit 工具返回结果
 */
interface EditToolResult {
  filePath: string;               // 编辑的文件路径
  oldString: string;              // 被替换的原始字符串
  newString: string;              // 替换后的新字符串
  originalFile: string | null;    // 原始文件完整内容，纯文本格式（无行号前缀，区别于 Read 的 cat -n 格式）
  structuredPatch: StructuredPatch[]; // 结构化补丁
  userModified: boolean;          // 用户是否修改
  replaceAll: boolean;            // 是否全部替换
}
```

---

## Write 工具

```typescript
/**
 * Write 工具返回结果
 */
interface WriteToolResult {
  type: 'create' | 'update';      // 创建或更新
  filePath: string;               // 写入的文件路径
  content: string;                // 写入的内容，纯文本格式（无行号前缀）
  structuredPatch: StructuredPatch[]; // 结构化补丁（更新时有值）
  originalFile: string | null;    // 原始文件内容，纯文本格式（更新时有值，创建时为 null）
}
```

**样例（创建文件）：**

```json
{
  "type": "create",
  "filePath": "/root/.claude/skills/workflow/SKILL.md",
  "content": "---\nname: workflow\ndescription: ...\n---\n\n# 完整开发流程\n...",
  "structuredPatch": [],
  "originalFile": null
}
```

---

## 错误返回

```typescript
/**
 * 工具错误返回结果
 */
interface ToolErrorResult {
  is_error: true;
  errorType: 'InputValidationError' | 'tool_use_error' | string;
  message: string;
  details?: Array<{
    expected: string;
    code: string;
    path: string[];
    message: string;
  }>;
}
```

**样例（InputValidationError）：**

```json
{
  "is_error": true,
  "errorType": "InputValidationError",
  "message": "Write failed due to the following issues:\nThe required parameter `file_path` is missing\nThe required parameter `content` is missing",
  "details": [
    {
      "expected": "string",
      "code": "invalid_type",
      "path": ["file_path"],
      "message": "Invalid input: expected string, received undefined"
    },
    {
      "expected": "string",
      "code": "invalid_type",
      "path": ["content"],
      "message": "Invalid input: expected string, received undefined"
    }
  ]
}
```

**样例（tool_use_error - Edit 找到多个匹配）：**

```json
{
  "is_error": true,
  "errorType": "tool_use_error",
  "message": "Found 4 matches of the string to replace, but replace_all is false. To replace all occurrences, set replace_all to true. To replace only one occurrence, please provide more context to uniquely identify the instance.\nString: LOG(...)"
}
```

```
```

