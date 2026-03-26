import { invalidPathDetail, stringifyError, stringifyResult, toErrorResult, ToolError } from '../src/wtc/result';

describe('result helpers', () => {
  // 校验 ToolError 作为统一错误类型时，是否完整保留协议字段。
  test('ToolError stores errorType message and details', () => {
    const details = [invalidPathDetail('/Worldbooks/设定集/正文')];
    const error = new ToolError('INVALID_PATH', '路径非法', details);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('ToolError');
    expect(error.errorType).toBe('INVALID_PATH');
    expect(error.message).toBe('路径非法');
    expect(error.details).toStrictEqual(details);
  });

  // 校验 ToolError 转换为对外结果时，details 不会丢失。
  test('toErrorResult preserves ToolError details', () => {
    const details = [invalidPathDetail('/Worldbooks/设定集/正文', 'path')];
    const result = toErrorResult(new ToolError('INVALID_PATH', '路径非法', details));

    expect(result).toStrictEqual({
      is_error: true,
      errorType: 'INVALID_PATH',
      message: '路径非法',
      details,
    });
  });

  // 校验普通 Error 会统一折叠成 tool_use_error，避免泄漏内部错误类型。
  test('toErrorResult folds normal Error into tool_use_error', () => {
    expect(toErrorResult(new Error('boom'))).toStrictEqual({
      is_error: true,
      errorType: 'tool_use_error',
      message: 'boom',
    });
  });

  // 校验非 Error 输入也能被稳定字符串化，避免出现未定义协议。
  test('toErrorResult stringifies non Error values', () => {
    expect(toErrorResult('bad input')).toStrictEqual({
      is_error: true,
      errorType: 'tool_use_error',
      message: 'bad input',
    });

    expect(toErrorResult({ reason: 'bad input' })).toStrictEqual({
      is_error: true,
      errorType: 'tool_use_error',
      message: '[object Object]',
    });
  });

  // 校验成功结果序列化保持普通 JSON 结构。
  test('stringifyResult serializes arbitrary objects', () => {
    expect(stringifyResult({ ok: true, count: 2 })).toBe('{"ok":true,"count":2}');
  });

  // 校验错误序列化对 ToolError 和未知异常都输出合法 JSON。
  test('stringifyError serializes ToolError and unknown failures', () => {
    expect(stringifyError(new ToolError('PERMISSION_DENIED', '拒绝访问'))).toBe(
      '{"is_error":true,"errorType":"PERMISSION_DENIED","message":"拒绝访问"}',
    );
    expect(stringifyError(new Error('boom'))).toBe('{"is_error":true,"errorType":"tool_use_error","message":"boom"}');
  });

  // 校验 invalidPathDetail 的默认字段名和自定义字段名都符合参数错误协议。
  test('invalidPathDetail defaults to file_path and supports custom fields', () => {
    expect(invalidPathDetail('/Worldbooks/设定集/正文')).toStrictEqual({
      expected: '合法的虚拟路径',
      received: '/Worldbooks/设定集/正文',
      path: ['file_path'],
    });
    expect(invalidPathDetail('-1', 'offset')).toStrictEqual({
      expected: '合法的虚拟路径',
      received: '-1',
      path: ['offset'],
    });
  });
});
