export type ToolErrorCode =
  | 'INVALID_PATH'
  | 'WORLD_NOT_FOUND'
  | 'WORLD_ALREADY_EXISTS'
  | 'ENTRY_NOT_FOUND'
  | 'PATH_IS_DIRECTORY'
  | 'PATH_CONFLICT'
  | 'TEXT_NOT_FOUND'
  | 'PERMISSION_DENIED'
  | 'USER_REJECTED'
  | 'CONTENT_TOO_LARGE'
  | 'InputValidationError';

export interface ToolErrorDetail {
  expected: string;
  received: string;
  path?: string[];
}

export interface ToolErrorResult {
  is_error: true;
  errorType: ToolErrorCode | (string & {});
  message: string;
  details?: ToolErrorDetail[];
}

export class ToolError extends Error {
  readonly errorType: ToolErrorCode | (string & {});
  readonly details?: ToolErrorDetail[];

  constructor(errorType: ToolErrorCode | (string & {}), message: string, details?: ToolErrorDetail[]) {
    super(message);
    this.name = 'ToolError';
    this.errorType = errorType;
    this.details = details;
  }
}

export function toErrorResult(error: unknown): ToolErrorResult {
  if (error instanceof ToolError) {
    return {
      is_error: true,
      errorType: error.errorType,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    };
  }

  return {
    is_error: true,
    errorType: 'tool_use_error',
    message: error instanceof Error ? error.message : String(error),
  };
}

export function stringifyResult(result: unknown): string {
  return JSON.stringify(result);
}

export function stringifyError(error: unknown): string {
  return JSON.stringify(toErrorResult(error));
}

export function invalidPathDetail(received: string, field = 'file_path'): ToolErrorDetail {
  return {
    expected: '合法的虚拟路径',
    received,
    path: [field],
  };
}

