import { z } from 'zod';
import { resetPermissionCache } from '@/wtc/permission';
import { stringifyError, stringifyResult, ToolError } from '@/wtc/result';
import {
  askUserQuestionAction,
} from '@/wtc/actions/ask_user_question';
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
  askUserQuestionArgsSchema,
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

function parseArgs<T>(schema: z.ZodType<T>, args: unknown): T {
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

function registerJsonTool<T>(
  name: string,
  description: string,
  schema: z.ZodType<T>,
  action: (args: T) => Promise<unknown>,
) {
  SillyTavern.registerFunctionTool({
    name,
    displayName: name,
    description,
    parameters: validationSchemaToJson(schema),
    stealth: true,
    formatMessage: () => '',
    shouldRegister: shouldRegisterTools,
    action: async rawArgs => {
      try {
        const args = parseArgs(schema, rawArgs);
        return stringifyResult(await action(args));
      } catch (error) {
        return stringifyError(error);
      }
    },
  });
}

export function registerLorebookTools() {
  registerJsonTool('Glob', '列出世界书或虚拟目录下的条目路径。', globArgsSchema, globAction);
  registerJsonTool('Grep', '在世界书条目内容中搜索文本。', grepArgsSchema, grepAction);
  registerJsonTool('Read', '读取世界书条目内容。', readArgsSchema, readAction);
  registerJsonTool('Write', '创建或覆盖世界书条目内容。', writeArgsSchema, writeAction);
  registerJsonTool('Edit', '替换世界书条目中的文本。', editArgsSchema, editAction);
  registerJsonTool('Delete', '删除世界书条目。', deleteArgsSchema, deleteAction);
  registerJsonTool('CreateLorebook', '创建空世界书。', createLorebookArgsSchema, createLorebookAction);
  registerJsonTool('AskUserQuestion', '向用户弹出一个问题。', askUserQuestionArgsSchema, askUserQuestionAction);
  registerJsonTool('GetAttribute', '获取世界书条目的属性。', getAttributeArgsSchema, getAttributeAction);
  registerJsonTool('SetAttribute', '更新世界书条目的属性。', setAttributeArgsSchema, setAttributeAction);

  return () => {
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
