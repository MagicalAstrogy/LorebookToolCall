import { z } from 'zod';
import { resetPermissionCache } from '@/wtc/permission';
import { stringifyResult, toErrorResult, ToolError } from '@/wtc/result';
//import { askUserQuestionAction } from '@/wtc/actions/ask_user_question';
import { createLorebookAction } from '@/wtc/actions/create_lorebook';
import { deleteAction } from '@/wtc/actions/delete';
import { editAction } from '@/wtc/actions/edit';
import { getAttributeAction } from '@/wtc/actions/get_attribute';
import { globAction } from '@/wtc/actions/glob';
import { grepAction } from '@/wtc/actions/grep';
import { readAction } from '@/wtc/actions/read';
import { setAttributeAction } from '@/wtc/actions/set_attribute';
import { writeAction } from '@/wtc/actions/write';
import {
//  askUserQuestionArgsSchema,
  createLorebookArgsSchema,
  deleteArgsSchema,
  getAttributeArgsSchema,
  globArgsSchema,
  grepArgsSchema,
  readArgsSchema,
  setAttributeArgsSchema,
  validationSchemaToJson,
  writeArgsSchema,
  editArgsSchema,
} from '@/wtc/schema';
import { extractReasoningDetails } from '@/wtc/hooks';

function parseArgs<T>(schema: z.ZodType<T>, args: unknown): T {
  // 统一把 zod issue 转成工具协议要求的 details 结构。
  const result = schema.safeParse(args);
  if (result.success) {
    return result.data;
  }
  throw new ToolError(
    'InputValidationError',
    '输入参数不合法。',
    result.error.issues.map(issue => ({
      expected: issue.message,
      received: JSON.stringify(issue.input) ?? String(issue.input),
      path: issue.path.map(part => String(part)),
    })),
  );
}

function shouldRegisterTools() {
  return SillyTavern.isToolCallingSupported() && SillyTavern.canPerformToolCalls('function');
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function registerJsonTool<T>(
  name: string,
  description: string,
  schema: z.ZodType<T>,
  action: (args: T) => Promise<unknown>,
) {
  // 每个工具都约定返回 JSON 字符串，成功失败都走同一层包装。
  SillyTavern.registerFunctionTool({
    name,
    displayName: name,
    description,
    parameters: validationSchemaToJson(schema),
    stealth: false,
    formatMessage: () => '',
    shouldRegister: shouldRegisterTools,
    action: async rawArgs => {
      let result: any = undefined;
      try {
        const args = parseArgs(schema, rawArgs);
        //避开 酒馆dry run的 generation？
        await delay(1500);
        result = await action(args);
      } catch (error) {
        result = toErrorResult(error);
      }
      const reasoningDetails = extractReasoningDetails();
      if (reasoningDetails) {
        result.reasoning_details = reasoningDetails;
      }
      return stringifyResult(result);
    },
  });
}

const globDescription =
  'Fast file pattern matching tool that works with any codebase size\n- Prefer passing `path` as the base directory and `pattern` as a relative glob, for example `path: "/"` with `pattern: "*"` or `path: "/Schemas"` with `pattern: "*.json"`\n- If you omit `path`, this tool also accepts absolute-style patterns like "/Worldbooks/${WorldbookName}/[mvu_update]*", "/Presets/${PresetName}/*", "/Characters/${CharacterName}/", or "/Schemas/*" and will automatically split the parent path into `path`\n- Returns matching file paths sorted by modification time\n- Use this tool when you need to find files by name patterns\n- When you are doing an open ended search that may require multiple rounds of globbing and grepping, use the Agent tool instead\n- You can call multiple tools in a single response. It is always better to speculatively perform multiple searches in parallel if they are potentially useful.';
const grepDescription =
  'A powerful search tool built on ripgrep\n\n  Usage:\n  - ALWAYS use Grep for search tasks. The Grep tool has been optimized for correct permissions and access.\n  - Supports full regex syntax (e.g., "log.*Error", "function\\s+\\w+")\n  - Filter files with glob parameter (e.g., "/Worldbooks/${WorldbookName}/*", "/Worldbooks/${WorldbookName}/[mvu_update]*")\n  - Output modes: "content" shows matching lines, "files_with_matches" shows only file paths (default), "count" shows match counts\n  - Use Agent tool for open-ended searches requiring multiple rounds\n  - Pattern syntax: Uses ripgrep (not grep) - literal braces need escaping (use `interface\\{\\}` to find `interface{}` in Go code)\n  - Multiline matching: By default patterns match within single lines only. For cross-line patterns like `struct \\{[\\s\\S]*?field`, use `multiline: true`\n';
const readDescription =
  'Reads an entry from the virtual lorebook filesystem.\n\nUsage:\n- The file_path parameter must be an absolute virtual path like "/Worldbooks/${WorldbookName}/Entry"\n- By default, it reads the whole entry from the beginning\n- You can optionally specify offset and limit for long entries\n- Results are returned using cat -n format, with line numbers starting at 1\n- This tool can only read entry paths, not roots or virtual directories\n- You can call multiple tools in a single response. It is always better to speculatively read multiple potentially useful entries in parallel.';
const writeDescription =
  'Writes an entry to the virtual lorebook filesystem.\n\nUsage:\n- This tool overwrites the existing entry if one already exists at the provided path\n- If the target path does not exist, this tool creates a new lorebook entry at that virtual path\n- Prefer the Edit tool for partial modifications when you only need to replace a small part of an existing entry\n- The file_path parameter must be an absolute virtual path like "/Worldbooks/${WorldbookName}/Entry"\n- This tool only operates on entry paths, not lorebook roots or virtual directories.';
const editDescription =
  'Performs exact string replacements in lorebook entries.\n\nUsage:\n- Use this tool when you want to replace one piece of text inside an existing entry without rewriting the whole content\n- The edit will fail if old_string is not found\n- The edit will also fail if old_string matches multiple places unless replace_all is true\n- The file_path parameter must be an absolute virtual path like "/Worldbooks/${WorldbookName}/Entry"\n- This tool only operates on entry paths, not lorebook roots or virtual directories.';
const deleteDescription =
  'Deletes an entry from the virtual lorebook filesystem.\n\nUsage:\n- The file_path parameter must be an absolute virtual path like "/Worldbooks/${WorldbookName}/Entry"\n- This tool does not delete virtual directories; if a path resolves to a directory-like prefix, the request will fail\n- Use this tool when you need to remove a specific lorebook entry.';
const createLorebookDescription =
  'Creates a new empty lorebook.\n\nUsage:\n- lorebook_name must be the exact lorebook name to create\n- The name must not contain "/"\n- If a lorebook with the same name already exists, the request will fail\n- Use this tool when you need a new lorebook root before writing entries into it.';
//const askUserQuestionDescription =
//  "Use this tool when you need to ask the user a direct question during execution.\n\nUsage:\n- Use this tool to gather missing information, clarify ambiguous instructions, or request user-provided text\n- The tool opens an input popup and returns the user's answer as a string\n- If the user cancels the popup, the request fails with USER_REJECTED\n- Prefer this tool only when the needed information cannot be inferred safely from the current context.";
const getAttributeDescription =
  'Retrieves the full attribute object for a lorebook entry.\n\nUsage:\n- The file_path parameter must be an absolute virtual path like "/Worldbooks/${WorldbookName}/Entry"\n- Attributes only exist on entries, not on lorebook roots or virtual directories\n- The returned attributes reuse the WorldbookEntry structure directly\n- Use this tool when you need metadata such as enabled state, insertion position, trigger strategy, or other entry fields.';
const setAttributeDescription =
  'Updates attributes for a lorebook entry using lossy patch semantics.\n\nUsage:\n- The file_path parameter must be an absolute virtual path like "/Worldbooks/${WorldbookName}/Entry"\n- The attributes parameter accepts a partial WorldbookEntry-shaped patch\n- Object fields are merged recursively, array fields are replaced as a whole, and scalar fields are overwritten\n- Fields you do not provide remain unchanged\n- If the patch changes comment and causes a normalized path conflict, the request will fail.';

export function registerLorebookTools() {
  // 注册集合与 doc/todo.md 中的 v1 工具列表保持一致。
  registerJsonTool('Glob', globDescription, globArgsSchema, globAction);
  registerJsonTool('Grep', grepDescription, grepArgsSchema, grepAction);
  registerJsonTool('Read', readDescription, readArgsSchema, readAction);
  registerJsonTool('Write', writeDescription, writeArgsSchema, writeAction);
  registerJsonTool('Edit', editDescription, editArgsSchema, editAction);
  registerJsonTool('Delete', deleteDescription, deleteArgsSchema, deleteAction);
  registerJsonTool('CreateLorebook', createLorebookDescription, createLorebookArgsSchema, createLorebookAction);
  //正常的对话就是问问题，所以不需要
  //registerJsonTool('AskUserQuestion', askUserQuestionDescription, askUserQuestionArgsSchema, askUserQuestionAction);
  registerJsonTool('GetAttribute', getAttributeDescription, getAttributeArgsSchema, getAttributeAction);
  registerJsonTool('SetAttribute', setAttributeDescription, setAttributeArgsSchema, setAttributeAction);

  return () => {
    // 页面卸载或脚本重载时，确保工具和临时授权一并清理。
    const names = [
      'Glob',
      'Grep',
      'Read',
      'Write',
      'Edit',
      'Delete',
      'CreateLorebook',
      'AskUserQuestion',
      'GetAttribute',
      'SetAttribute',
    ];
    for (const name of names) {
      SillyTavern.unregisterFunctionTool(name);
    }
    resetPermissionCache();
  };
}
