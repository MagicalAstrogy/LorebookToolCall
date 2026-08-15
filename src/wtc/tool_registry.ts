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
  'Lists virtual files and directories matching a glob.\nExamples:\n- Direct children: {"path":"/Worldbooks/Book","pattern":"*"}\n- Recursive tree: {"path":"/Worldbooks/Book","pattern":"**/*"}\n- Name filter: {"path":"/Worldbooks/Book","pattern":"[mvu_update]*"}';
const grepDescription =
  'Searches virtual text files with a regular expression.\nExamples:\n- Matching files (default): {"path":"/Worldbooks/Book","pattern":"keyword"}\n- Matching content with context: {"path":"/Worldbooks/Book","pattern":"keyword","output_mode":"content","context":2}\n- Match counts: {"path":"/Worldbooks/Book","pattern":"keyword","output_mode":"count"}\n- Glob filter: {"path":"/Worldbooks/Book","pattern":"keyword","glob":"notes/*.md"}\n- File type filter: {"path":"/Worldbooks/Book","pattern":"keyword","type":"md"}\n- Ignore case: {"path":"/Worldbooks/Book","pattern":"keyword","-i":true}\n- Multiline match: {"path":"/Worldbooks/Book","pattern":"BEGIN.*END","multiline":true,"output_mode":"content"}\n- Paginate matched files: {"path":"/Worldbooks/Book","pattern":"keyword","offset":20,"head_limit":10}';
const readDescription =
  'Reads a virtual text file with line numbers.\nExamples:\n- Automatic chunk: {"file_path":"/Worldbooks/Book/Entry"}\n- Continue when `file.hasMore` is true: {"file_path":"/Worldbooks/Book/Entry","offset":120} (use the returned `file.nextOffset`)\n- Read selected lines: {"file_path":"/Worldbooks/Book/Entry","offset":40,"limit":20}\n- Read all remaining lines: {"file_path":"/Worldbooks/Book/Entry","offset":0,"limit":0}';
const writeDescription =
  'Creates or replaces a virtual text file. The same form creates a missing file or overwrites an existing one.\nExample: {"file_path":"/Worldbooks/Book/Entry","content":"full text"}';
const editDescription =
  'Replaces exact text in a virtual file.\nExamples:\n- Replace one unique match: {"file_path":"/Worldbooks/Book/Entry","old_string":"old text","new_string":"new text"}\n- Replace every match: {"file_path":"/Worldbooks/Book/Entry","old_string":"old text","new_string":"new text","replace_all":true}';
const deleteDescription =
  'Deletes a virtual file.\nExample: {"file_path":"/Worldbooks/Book/Entry"}';
const createLorebookDescription =
  'Creates an empty lorebook.\nExample: {"lorebook_name":"New Book"}';
//const askUserQuestionDescription =
//  "Use this tool when you need to ask the user a direct question during execution.\n\nUsage:\n- Use this tool to gather missing information, clarify ambiguous instructions, or request user-provided text\n- The tool opens an input popup and returns the user's answer as a string\n- If the user cancels the popup, the request fails with USER_REJECTED\n- Prefer this tool only when the needed information cannot be inferred safely from the current context.";
const getAttributeDescription =
  'Returns the attributes of a worldbook-backed virtual file.\nExample: {"file_path":"/Worldbooks/Book/Entry"}';
const setAttributeDescription =
  'Patches worldbook attributes. Objects merge recursively; arrays and scalars replace old values.\nExamples:\n- Basic state: {"file_path":"/Worldbooks/Book/Entry","attributes":{"enabled":true,"probability":100}}\n- Trigger strategy: {"file_path":"/Worldbooks/Book/Entry","attributes":{"strategy":{"type":"selective","keys":["keyword"]}}}\n- Insertion position: {"file_path":"/Worldbooks/Book/Entry","attributes":{"position":{"type":"at_depth","role":"system","depth":4,"order":100}}}\n- Recursion and effects: {"file_path":"/Worldbooks/Book/Entry","attributes":{"recursion":{"prevent_incoming":true},"effect":{"sticky":3,"cooldown":0}}}';

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
