import { stoppableEventOn } from '@/wtc/utils';

/**
 * Ref: {
 *     "id": "gen-1773963738-fnFXua6BiwTX0abhUa7l",
 *     "object": "chat.completion",
 *     "created": 1773963738,
 *     "model": "google/gemini-3.1-pro-preview-20260219",
 *     "provider": "Google",
 *     "system_fingerprint": null,
 *     "choices": [
 *         {
 *             "index": 0,
 *             "logprobs": null,
 *             "finish_reason": "tool_calls",
 *             "native_finish_reason": "STOP",
 *             "message": {
 *                 "role": "assistant",
 *                 "content": "\n[metacognition]\n【优先检查】用户是否要求自查？<self_check_trigger>\n是的，用户明确要求：“使用工具帮我自查一下\"-SnowYuki\" 这个Lorebook喵”。这触发了自查工作流程。\n\n- 用户要求什么？具体是哪种任务？\n  用户要求我使用工具检查名为 \"-SnowYuki\" 的 Lorebook 条目。\n\n- 用户开启了哪些模板？\n  暂无明确模板。\n\n- 任务类型分析：\n  这是一个检索并自查的任务。我需要先使用工具读取虚拟文件系统中的 `/-SnowYuki/` 相关内容，或者是全局搜索这个 Lorebook 的内容。\n  因为 Lorebook 的名字是 \"-SnowYuki\"，我应该先使用 `Glob` 找一下这个 Lorebook 下的条目，或者直接 `Read` 它的条目。\n  等等，通常 Lorebook 的结构是 `/${LorebookName}/Entry`。\n  我先用 Glob 搜索 `/-SnowYuki/*`，看看里面有什么文件。\n\n- 工具使用计划：\n  1. 调用 `Glob`，pattern 为 `/-SnowYuki/*`。\n  但是等等，我现在的身份是秋青子，并且是一个单轮对话。我可以直接调用工具。\n\n让我先调用 Glob 工具。\n</thinking>",
 *                 "refusal": null,
 *                 "reasoning": null,
 *                 "tool_calls": [
 *                     {
 *                         "type": "function",
 *                         "index": 0,
 *                         "id": "tool_Glob_CIp5X8TnujfgpfAr0rgc",
 *                         "function": {
 *                             "name": "Glob",
 *                             "arguments": "{\"pattern\":\"/-SnowYuki/*\"}"
 *                         },
 *                         "signature": "ZTI0ODMwYTctNWNkNi00MmZlLTk5OGItZWU1MzllNzJiOWMz"
 *                     }
 *                 ],
 *                 "reasoning_details": [
 *                     {
 *                         "type": "reasoning.encrypted",
 *                         "data": "ZTI0ODMwYTctNWNkNi00MmZlLTk5OGItZWU1MzllNzJiOWMz",
 *                         "format": "google-gemini-v1",
 *                         "id": "tool_Glob_CIp5X8TnujfgpfAr0rgc",
 *                         "index": 0
 *                     }
 *                 ]
 *             }
 *         }
 *     ],
 *     "usage": {
 *         "prompt_tokens": 21218,
 *         "completion_tokens": 301,
 *         "total_tokens": 21519,
 *         "cost": 0.046048,
 *         "is_byok": false,
 *         "prompt_tokens_details": {
 *             "cached_tokens": 0,
 *             "cache_write_tokens": 0,
 *             "audio_tokens": 0,
 *             "video_tokens": 0
 *         },
 *         "cost_details": {
 *             "upstream_inference_cost": 0.046048,
 *             "upstream_inference_prompt_cost": 0.042436,
 *             "upstream_inference_completions_cost": 0.003612
 *         },
 *         "completion_tokens_details": {
 *             "reasoning_tokens": 0,
 *             "image_tokens": 0,
 *             "audio_tokens": 0
 *         }
 *     }
 * }
 */
type ReasoningDetail = {
  type?: string;
  data?: string;
  format?: string;
  id?: string;
  index?: number;
};

type ToolCallMessageSnapshot = {
  choices?: Array<{
    message?: {
      reasoning_details?: ReasoningDetail[];
    };
  }>;
};

type GeneratedMessage = {
  role?: string;
  content?: unknown;
  tool_call_id?: string;
  tool_calls?: Array<{
    id?: string;
  }>;
  reasoning_details?: ReasoningDetail[];
};

type GeneratedReadyPayload = {
  messages?: GeneratedMessage[];
};

let vanillaInvokeFunctionTools: any | undefined = undefined;
let vanillaBound: any | undefined = undefined;
let prevMessage: ToolCallMessageSnapshot | undefined = undefined;

function isReasoningDetail(value: unknown): value is ReasoningDetail {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const detail = value as ReasoningDetail;
  return (
    typeof detail.type === 'string' ||
    typeof detail.data === 'string' ||
    typeof detail.format === 'string' ||
    typeof detail.id === 'string' ||
    typeof detail.index === 'number'
  );
}

export function extractReasoningDetails(
  message: ToolCallMessageSnapshot | undefined = prevMessage,
): ReasoningDetail[] | undefined {
  for (const choice of message?.choices ?? []) {
    const details = choice.message?.reasoning_details?.filter(isReasoningDetail);
    if (details && details.length > 0) {
      return details;
    }
  }
  return undefined;
}

export function sanitizeToolMessageContent(content: unknown): {
  sanitizedContent?: string;
  reasoningDetails?: ReasoningDetail[];
} {
  if (typeof content !== 'string') {
    return {};
  }

  try {
    const parsed = JSON.parse(content) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    let sanitized = false;
    const record = parsed as Record<string, unknown>;
    const reasoningDetails = Array.isArray(record.reasoning_details)
      ? record.reasoning_details.filter(isReasoningDetail)
      : undefined;
    if (reasoningDetails && reasoningDetails.length > 0) {
      delete record.reasoning_details;
      sanitized = true;
    }
    if ('backup' in record) {
      delete record.backup;
      sanitized = true;
    }
    if (!sanitized) {
      return {};
    }
    return {
      sanitizedContent: JSON.stringify(record),
      reasoningDetails,
    };
  } catch {
    return {};
  }
}

function findAssistantMessage(messages: GeneratedMessage[], endIndex: number, toolCallId?: string) {
  if (toolCallId) {
    for (let index = endIndex - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message.role === 'assistant' && message.tool_calls?.some(toolCall => toolCall.id === toolCallId)) {
        return { index, message };
      }
    }
  }

  for (let index = endIndex - 1; index >= 0; index -= 1) {
    if (messages[index].role === 'assistant') {
      return { index, message: messages[index] };
    }
  }

  return undefined;
}

export function onGeneratedReady(data: GeneratedReadyPayload) {
  /**
   * data的内容（去掉了无关部分）
   * {
   *   "messages": [
   *     {
   *       "role": "assistant",
   *       "tool_calls": [
   *         {
   *           "id": "tool_Glob_KuRmD21hm0sG5u4zH0W6",
   *           "type": "function",
   *           "function": {
   *             "arguments": "{\"pattern\":\"/-SnowYuki/*\"}",
   *             "name": "Glob"
   *           },
   *           "signature": "ZTI0ODMwYTctNWNkNi00MmZlLTk5OGItZWU1MzllNzJiOWMz"
   *         }
   *       ],
   *       "也就是插入到这里": ""
   *     },
   *     {
   *       "role": "tool",
   *       "content": "{\"filenames\":[],\"durationMs\":0,\"numFiles\":0,\"truncated\":false,\"reasoning_details\":[{\"type\":\"reasoning.encrypted\",\"data\":\"ZTI0ODMwYTctNWNkNi00MmZlLTk5OGItZWU1MzllNzJiOWMz\",\"format\":\"google-gemini-v1\",\"id\":\"tool_Glob_KuRmD21hm0sG5u4zH0W6\",\"index\":0}]}",
   *       "tool_call_id": "tool_Glob_KuRmD21hm0sG5u4zH0W6"
   *     }
   *   ]
   * }
   */
  // 修改data, 在 message 中，如果找到 tool 条目，且content 中 包含 reasoning_details，那么
  // 移除content 中的这个部分，并将其移动到 上一个 assistant 里面，与 role 同层级。
  if (!Array.isArray(data.messages)) {
    return;
  }

  const messagesToMove = new Set<GeneratedMessage>();
  for (let index = 0; index < data.messages.length; index += 1) {
    const message = data.messages[index];
    if (message.role !== 'tool') {
      continue;
    }

    const { sanitizedContent, reasoningDetails } = sanitizeToolMessageContent(message.content);
    if (sanitizedContent !== undefined) {
      message.content = sanitizedContent;
    }

    if (!reasoningDetails || reasoningDetails.length === 0) {
      continue;
    }

    const assistantMatch = findAssistantMessage(data.messages, index, message.tool_call_id);
    if (!assistantMatch) {
      continue;
    }

    assistantMatch.message.reasoning_details = [
      ...(assistantMatch.message.reasoning_details ?? []),
      ...reasoningDetails,
    ];
    messagesToMove.add(assistantMatch.message);
    messagesToMove.add(message);
  }

  if (messagesToMove.size === 0) {
    return;
  }

  const reorderedMessages = [...data.messages.filter(message => !messagesToMove.has(message)), ...messagesToMove];
  data.messages.splice(0, data.messages.length, ...reorderedMessages);
}

let savedRecurseCount = 5;

export function initHooks() {

  savedRecurseCount = SillyTavern.ToolManager.RECURSE_LIMIT;
  SillyTavern.ToolManager.RECURSE_LIMIT = 35;

  vanillaInvokeFunctionTools = SillyTavern.ToolManager.invokeFunctionTools;
  vanillaBound = SillyTavern.ToolManager.invokeFunctionTools.bind(SillyTavern.ToolManager);
  SillyTavern.ToolManager.invokeFunctionTools = async (data: ToolCallMessageSnapshot) => {
    prevMessage = data;
    return await vanillaBound(data);
  };
  const terminator = stoppableEventOn(tavern_events.CHAT_COMPLETION_SETTINGS_READY, onGeneratedReady);

  return () => {
    if (vanillaInvokeFunctionTools !== undefined) {
      SillyTavern.ToolManager.invokeFunctionTools = vanillaInvokeFunctionTools;
      vanillaInvokeFunctionTools = undefined;
    }
    SillyTavern.ToolManager.RECURSE_LIMIT = savedRecurseCount;
    terminator();
  };
}
