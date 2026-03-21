import { onGeneratedReady, sanitizeToolMessageContent } from '../src/wtc/hooks';

describe('hooks tool message sanitization', () => {
  test('removes backup from tool content before messages are forwarded', () => {
    const sanitized = sanitizeToolMessageContent(
      JSON.stringify({
        filePath: '/设定集/正文',
        backup: {
          rollbackMethod: 'editRollback',
          filePath: '/设定集/正文',
        },
      }),
    );

    expect(sanitized.sanitizedContent).toBe(JSON.stringify({ filePath: '/设定集/正文' }));
    expect(sanitized.reasoningDetails).toBeUndefined();
  });

  test('moves reasoning_details and strips backup in onGeneratedReady', () => {
    const payload: any = {
      messages: [
        {
          role: 'assistant',
          tool_calls: [{ id: 'tool_1' }],
          content: '',
        },
        {
          role: 'tool',
          tool_call_id: 'tool_1',
          content: JSON.stringify({
            filePath: '/设定集/正文',
            backup: { rollbackMethod: 'writeRollback' },
            reasoning_details: [
              {
                type: 'reasoning.encrypted',
                data: 'encrypted',
                format: 'google-gemini-v1',
                id: 'tool_1',
                index: 0,
              },
            ],
          }),
        },
      ],
    };

    onGeneratedReady(payload);

    expect(payload.messages).toHaveLength(2);
    expect(payload.messages[0].role).toBe('assistant');
    expect(payload.messages[0].reasoning_details).toHaveLength(1);
    expect(payload.messages[1].role).toBe('tool');
    expect(payload.messages[1].content).toBe(JSON.stringify({ filePath: '/设定集/正文' }));
  });
});
