import { triggerSlashAction } from '../src/wtc/actions/slash';
import { registerLorebookTools } from '../src/wtc/tool_registry';

afterEach(() => {
  delete (globalThis as any).triggerSlash;
  delete (globalThis as any).SillyTavern;
  jest.useRealTimers();
});

describe('triggerSlashAction', () => {
  test('forwards the command and wraps the pipeline result', async () => {
    const triggerSlashMock = jest.fn().mockResolvedValue('pipeline output');
    (globalThis as any).triggerSlash = triggerSlashMock;

    await expect(triggerSlashAction({ command: '/pass pipeline output' })).resolves.toStrictEqual({
      result: 'pipeline output',
    });
    expect(triggerSlashMock).toHaveBeenCalledWith('/pass pipeline output');
  });
});

describe('TriggerSlash tool registration', () => {
  test('registers a command-only JSON tool and unregisters it during cleanup', async () => {
    jest.useFakeTimers();
    const registeredTools: any[] = [];
    const unregisterFunctionTool = jest.fn();
    (globalThis as any).SillyTavern = {
      isToolCallingSupported: () => true,
      canPerformToolCalls: () => true,
      registerFunctionTool: (tool: any) => registeredTools.push(tool),
      unregisterFunctionTool,
    };
    const triggerSlashMock = jest.fn().mockResolvedValue('42');
    (globalThis as any).triggerSlash = triggerSlashMock;

    const stop = registerLorebookTools();
    const tool = registeredTools.find(candidate => candidate.name === 'TriggerSlash');

    expect(tool).toBeDefined();
    expect(tool.parameters.required).toStrictEqual(['command']);
    expect(Object.keys(tool.parameters.properties)).toStrictEqual(['command']);

    const invocation = tool.action({ command: '/pass 42' });
    await jest.advanceTimersByTimeAsync(1500);
    await expect(invocation).resolves.toBe('{"result":"42"}');
    expect(triggerSlashMock).toHaveBeenCalledWith('/pass 42');

    stop();
    expect(unregisterFunctionTool).toHaveBeenCalledWith('TriggerSlash');
  });
});
