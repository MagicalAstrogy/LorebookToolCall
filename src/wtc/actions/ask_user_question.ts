import type { z } from 'zod';
import { ToolError } from '@/wtc/result';
import { askUserQuestionArgsSchema } from '@/wtc/schema';

export async function askUserQuestionAction(args: z.infer<typeof askUserQuestionArgsSchema>) {
  // 该工具是显式的人机交互出口，取消输入按统一业务错误返回。
  const result = await SillyTavern.callGenericPopup(args.question, SillyTavern.POPUP_TYPE.INPUT, '', {
    okButton: '提交',
    cancelButton: '取消',
    rows: 4,
    wider: true,
  });
  if (result === false || result === undefined || result === SillyTavern.POPUP_RESULT.CANCELLED) {
    throw new ToolError('USER_REJECTED', '用户取消了输入。');
  }
  return {
    question: args.question,
    answer: String(result),
  };
}
