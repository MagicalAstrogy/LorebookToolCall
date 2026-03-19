import { toErrorResult } from '../../src/wtc/result';

export async function expectToolError(action: Promise<unknown>) {
  try {
    await action;
    throw new Error('Expected action to throw ToolError');
  } catch (error) {
    return toErrorResult(error);
  }
}
