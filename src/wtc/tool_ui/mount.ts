import { createApp, h, reactive } from 'vue';
import ToolCallBlock from '@/wtc/tool_ui/components/ToolCallBlock.vue';
import type { ToolCallBlockModel } from '@/wtc/tool_ui/types';
import { areInvocationSetsEquivalent, hasKnownTool, normalizeToolCallBlock, parseInvocationArrayText } from '@/wtc/tool_ui/model';
import { stoppableEventOn } from '@/wtc/utils';
import { teleportStyle } from '@util/script';

type MountedState = {
  messageId: number;
  blockKey: string;
  $details: JQuery<HTMLElement>;
  $pre: JQuery<HTMLElement>;
  $host: JQuery<HTMLElement>;
  app: ReturnType<typeof createApp>;
  data: {
    block: ToolCallBlockModel;
  };
  destroy: () => void;
};

/**
 * Example invocation:
 * [
 *     {
 *         "id": "tool_Glob_dTu3mOCdhpaejdwE12nW",
 *         "displayName": "Glob",
 *         "name": "Glob",
 *         "parameters": "{\"path\":\"/-SnowYuki\",\"pattern\":\"*\"}",
 *         "result": "{\"filenames\":[\"/-SnowYuki/NPC信息\",\"/-SnowYuki/[InitVar]初始变量1\",\"/-SnowYuki/[initvar]初始变量2\",\"/-SnowYuki/[mvu_plot]格式强调-剧情演绎\",\"/-SnowYuki/[mvu_update]变量更新规则\",\"/-SnowYuki/[mvu_update]格式强调-变量更新规则\",\"/-SnowYuki/变量分阶段-好感度\",\"/-SnowYuki/变量输出\",\"/-SnowYuki/角色事件-告白\",\"/-SnowYuki/角色信息\"],\"durationMs\":0,\"numFiles\":10,\"truncated\":false,\"reasoning_details\":[{\"type\":\"reasoning.encrypted\",\"data\":\"ZTI0ODMwYTctNWNkNi00MmZlLTk5OGItZWU1MzllNzJiOWMz\",\"format\":\"google-gemini-v1\",\"id\":\"tool_Glob_dTu3mOCdhpaejdwE12nW\",\"index\":0}]}",
 *         "signature": "ZTI0ODMwYTctNWNkNi00MmZlLTk5OGItZWU1MzllNzJiOWMz"
 *     }
 * ]
 */

const stateMap = new Map<string, MountedState>();

function getMessageIdByInvocations(invocations: unknown[]) {
  return SillyTavern.chat.findLastIndex(message => message?.extra?.tool_invocations === invocations);
}

function getCandidateDetails($message: JQuery<HTMLElement>) {
  return $message
    .find('.mes_text details')
    .filter((_index, node) => {
      const $node = $(node);
      return $node.children('pre').length > 0 && $node.find('summary').text().includes('Tool calls:');
    }) as JQuery<HTMLElement>;
}

function findMatchingDetails($message: JQuery<HTMLElement>, invocations: unknown[]) {
  const $candidates = getCandidateDetails($message);
  if ($candidates.length === 0) {
    return null;
  }

  // 优先用 code block 里的 JSON 反解析做精确匹配；只剩一个候选时再退化为单候选兜底。
  const matches = $candidates
    .toArray()
    .map((node, index) => {
      const text = $(node).find('pre code').text().trim();
      const parsed = parseInvocationArrayText(text);
      return { node, index, parsed };
    })
    .filter(candidate => candidate.parsed && areInvocationSetsEquivalent(candidate.parsed, invocations));

  if (matches.length > 0) {
    const match = matches[0];
    return { $details: $(match.node), detailsIndex: match.index };
  }

  if ($candidates.length === 1) {
    return { $details: $($candidates[0]), detailsIndex: 0 };
  }

  return null;
}

function destroyState(blockKey: string) {
  const state = stateMap.get(blockKey);
  if (!state) {
    return;
  }
  state.destroy();
}

function cleanupAllStates() {
  for (const blockKey of [...stateMap.keys()]) {
    destroyState(blockKey);
  }
}

function isNodeAlive(node: Node | undefined) {
  return Boolean(node?.isConnected);
}

function pruneInvalidStates() {
  // 楼层重渲染后原 DOM 可能直接被替换，定期把失效挂载点回收掉。
  for (const [blockKey, state] of stateMap.entries()) {
    if (!isNodeAlive(state.$details[0]) || !isNodeAlive(state.$pre[0]) || !isNodeAlive(state.$host[0])) {
      destroyState(blockKey);
    }
  }
}

function cleanupMessage(messageId: number) {
  for (const [blockKey, state] of stateMap.entries()) {
    if (state.messageId === messageId) {
      destroyState(blockKey);
    }
  }
}

function backfillVisibleToolCalls() {
  // 只补挂当前页面上已经渲染出来的连续楼层；一旦撞到未加载的历史楼层就停止向前扫描。
  for (let index = SillyTavern.chat.length - 1; index >= 0; index -= 1) {
    const message = SillyTavern.chat[index];
    const messageId = index;
    if ($(`#chat .mes[mesid="${messageId}"]`).length === 0) {
      break;
    }
    if (Array.isArray(message?.extra?.tool_invocations)) {
      renderToolCalls(message.extra.tool_invocations);
    }
  }
}

function renderToolCalls(invocations: unknown[]) {
  if (!Array.isArray(invocations) || invocations.length === 0 || !hasKnownTool(invocations)) {
    return;
  }

  const messageId = getMessageIdByInvocations(invocations);
  if (messageId < 0) {
    return;
  }

  const $message = $(`#chat .mes[mesid="${messageId}"]`) as JQuery<HTMLElement>;
  if ($message.length === 0) {
    return;
  }

  const matched = findMatchingDetails($message, invocations);
  if (!matched) {
    return;
  }

  const { $details, detailsIndex } = matched;
  const $pre = $details.children('pre') as JQuery<HTMLElement>;
  if ($pre.length === 0) {
    return;
  }

  const blockKey = `${messageId}:${detailsIndex}`;
  const nextBlock = normalizeToolCallBlock(messageId, blockKey, invocations);
  const existed = stateMap.get(blockKey);
  if (existed) {
    // 同一个工具块重复渲染时只更新响应式数据，避免反复 mount/unmount。
    existed.data.block = nextBlock;
    return;
  }

  const $host = $('<div class="WtcToolUiHost">').insertAfter($pre) as JQuery<HTMLElement>;
  $pre.hide();

  const data = reactive({
    block: nextBlock,
  });

  const app = createApp({
    render: () => h(ToolCallBlock, { block: data.block }),
  });

  app.mount($host[0]);

  const destroy = () => {
    if (!stateMap.has(blockKey)) {
      return;
    }
    app.unmount();
    $host.remove();
    if (isNodeAlive($pre[0])) {
      $pre.show();
    }
    stateMap.delete(blockKey);
  };

  stateMap.set(blockKey, {
    messageId,
    blockKey,
    $details,
    $pre,
    $host,
    app,
    data,
    destroy,
  });
}

export function initToolCallUi() {
  const ownStops = [
    stoppableEventOn('chatLoaded', () => {
      cleanupAllStates();
      queueMicrotask(backfillVisibleToolCalls);
    }),
    stoppableEventOn(tavern_events.TOOL_CALLS_RENDERED, invocations => {
      pruneInvalidStates();
      renderToolCalls(invocations as unknown[]);
    }),
    /* 工具调用消息不太可能被更新。
    stoppableEventOn(tavern_events.MESSAGE_UPDATED, messageId => {
      queueMicrotask(() => rerenderMessage(messageId));
    }),
    stoppableEventOn(tavern_events.MESSAGE_EDITED, messageId => {
      queueMicrotask(() => rerenderMessage(messageId));
    }),
    */
    stoppableEventOn(tavern_events.MESSAGE_DELETED, messageId => {
      cleanupMessage(messageId);
      queueMicrotask(pruneInvalidStates);
    }),
    stoppableEventOn(tavern_events.MORE_MESSAGES_LOADED, () => {
      queueMicrotask(() => {
        pruneInvalidStates();
        backfillVisibleToolCalls();
      });
    }),
    stoppableEventOn(tavern_events.CHAT_CHANGED, () => {
      cleanupAllStates();
    }),
  ];
  const { destroy: destroyStyle } = teleportStyle();

  queueMicrotask(() => {
    backfillVisibleToolCalls();
  });

  return () => {
    ownStops.forEach(stop => stop());
    cleanupAllStates();
    destroyStyle();
  };
}
