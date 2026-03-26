import { z } from 'zod';

// 这里定义的 schema 同时服务于运行时参数校验和工具注册时的 JSON Schema 导出。
const globPathDescription =
  '要搜索的虚拟目录路径。使用绝对路径，如 "/Worldbooks/设定集"、"/Characters/角色名" 或 "/Schemas"；省略时默认为根目录 "/"。';
const entryPathDescription =
  '世界书条目的绝对虚拟路径，如 "/WorldBooks/设定集/NPC/理理"。只接受条目路径，不接受世界书根或虚拟目录。';

export const globArgsSchema = z
  .object({
    pattern: z
      .string()
      .min(1)
      .describe('用于匹配文件名的 glob 模式，例如 "*"、"**/*"、"[mvu_update]*"。若不提供 path，也兼容绝对写法，如 "/Schemas/*"。'),
    path: z.string().describe(globPathDescription),
  })
  .describe('Glob 工具参数：按名称模式列出虚拟世界书文件系统中的文件或目录。');

export const grepArgsSchema = z
  .object({
    pattern: z.string().min(1).describe('用于搜索条目内容的正则表达式模式。'),
    path: z.string().min(1).describe('搜索起点的绝对虚拟路径，必须位于某一个确定的 "/Worldbooks/<Name>" 或 "/Characters/<Name>" 子树内，不能是根目录 "/" 或集合根目录。'),
    glob: z.string().optional().describe('用于过滤候选条目路径的 glob 模式，匹配基于 path 的相对路径。'),
    type: z.string().optional().describe('按文件扩展名近似过滤的类型名，如 "ts"、"js"、"json"、"md"、"yaml"。'),
    output_mode: z
      .enum(['content', 'files_with_matches', 'count'])
      .optional()
      .describe('输出模式：content 返回匹配内容，files_with_matches 返回文件路径，count 返回每个文件的命中次数。'),
    '-B': z.number().int().nonnegative().optional().describe('仅在 output_mode 为 content 时生效：为每个匹配额外返回前面的 N 行。'),
    '-A': z.number().int().nonnegative().optional().describe('仅在 output_mode 为 content 时生效：为每个匹配额外返回后面的 N 行。'),
    '-C': z.number().int().nonnegative().optional().describe('context 的别名：为每个匹配同时返回前后各 N 行。'),
    context: z.number().int().nonnegative().optional().describe('仅在 output_mode 为 content 时生效：为每个匹配同时返回前后各 N 行。'),
    '-n': z.boolean().optional().describe('是否显示行号。当前 content 输出天然带行号分隔格式，默认行为保持开启。'),
    '-i': z.boolean().optional().describe('是否忽略大小写。'),
    head_limit: z.number().int().nonnegative().optional().describe('跳过 offset 后，最多返回前 N 条结果或内容块；0 或省略表示不限制。'),
    offset: z.number().int().nonnegative().optional().describe('跳过前 N 条结果或内容块后再开始返回；默认从 0 开始。'),
    multiline: z.boolean().optional().describe('是否启用多行正则模式，让模式可以跨越换行匹配。'),
  })
  .describe('Grep 工具参数：在虚拟文件系统中按内容搜索条目。');

export const readArgsSchema = z
  .object({
    file_path: z.string().min(1).describe(entryPathDescription),
    offset: z.number().int().optional().describe('从第几行开始读取，0 表示从第一行开始；仅在内容较长时提供。'),
    limit: z.number().int().optional().describe('最多读取多少行；省略时会读取尽可能多的内容，但超长内容会触发保护限制。'),
  })
  .describe('Read 工具参数：读取一个世界书条目的文本内容。');

export const writeArgsSchema = z
  .object({
    file_path: z.string().min(1).describe(entryPathDescription),
    content: z.string().describe('要写入条目的完整文本内容。若条目已存在则整体覆盖，不存在则创建新条目。'),
  })
  .describe('Write 工具参数：创建或覆盖一个世界书条目。');

export const editArgsSchema = z
  .object({
    file_path: z.string().min(1).describe(entryPathDescription),
    old_string: z.string().describe('要在条目内容中查找并替换的原始文本。'),
    new_string: z.string().describe('用于替换 old_string 的新文本。'),
    replace_all: z.boolean().optional().describe('设为 true 时替换全部命中；省略或 false 时要求 old_string 只能命中一次。'),
  })
  .describe('Edit 工具参数：对已有世界书条目执行精确字符串替换。');

export const deleteArgsSchema = z
  .object({
    file_path: z.string().min(1).describe(entryPathDescription),
  })
  .describe('Delete 工具参数：删除一个世界书条目。');

export const createLorebookArgsSchema = z
  .object({
    lorebook_name: z.string().min(1).describe('要创建的世界书名称，必须与 SillyTavern 中显示的名称一致，且不能包含 "/"。'),
  })
  .describe('CreateLorebook 工具参数：创建一个新的空世界书。');

export const askUserQuestionArgsSchema = z
  .object({
    question: z.string().min(1).describe('需要直接询问用户的问题文本。用于补充缺失信息、澄清歧义或请求用户提供内容。'),
  })
  .describe('AskUserQuestion 工具参数：弹出输入框向用户提问。');

const scalarOrRegexSchema = z.string().describe('关键字项，使用字符串形式表示；可以是普通文本，也可以是正则表达式的字符串表示。');

export const WORLDBOOK_ENTRY_PATCH_SCAN_DEPTH_SAME_AS_GLOBAL = 0;
export const WORLDBOOK_ENTRY_PATCH_NULL_SENTINEL = 0;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === '[object Object]';
}

export function decodeWorldbookEntryPatchSpecialValues(patch: Record<string, unknown>): Record<string, unknown> {
  const normalized = structuredClone(patch);

  if (isPlainObject(normalized.strategy) && normalized.strategy.scan_depth === WORLDBOOK_ENTRY_PATCH_SCAN_DEPTH_SAME_AS_GLOBAL) {
    normalized.strategy.scan_depth = 'same_as_global';
  }

  if (isPlainObject(normalized.recursion) && normalized.recursion.delay_until === WORLDBOOK_ENTRY_PATCH_NULL_SENTINEL) {
    normalized.recursion.delay_until = null;
  }

  if (isPlainObject(normalized.effect)) {
    for (const key of ['sticky', 'cooldown', 'delay'] as const) {
      if (normalized.effect[key] === WORLDBOOK_ENTRY_PATCH_NULL_SENTINEL) {
        normalized.effect[key] = null;
      }
    }
  }

  return normalized;
}

export function encodeWorldbookEntryPatchSpecialValues(attributes: Record<string, unknown>): Record<string, unknown> {
  const normalized = structuredClone(attributes);

  if (isPlainObject(normalized.strategy) && normalized.strategy.scan_depth === 'same_as_global') {
    normalized.strategy.scan_depth = WORLDBOOK_ENTRY_PATCH_SCAN_DEPTH_SAME_AS_GLOBAL;
  }

  if (isPlainObject(normalized.recursion) && normalized.recursion.delay_until === null) {
    normalized.recursion.delay_until = WORLDBOOK_ENTRY_PATCH_NULL_SENTINEL;
  }

  if (isPlainObject(normalized.effect)) {
    for (const key of ['sticky', 'cooldown', 'delay'] as const) {
      if (normalized.effect[key] === null) {
        normalized.effect[key] = WORLDBOOK_ENTRY_PATCH_NULL_SENTINEL;
      }
    }
  }

  return normalized;
}

// SetAttribute 直接复用世界书条目的字段模型，语义是 lossy patch：
// 对象递归合并，数组整体替换，未提供字段保持原值。
export const worldbookEntryPatchSchema: z.ZodType<any> = z
  .object({
    uid: z.number().int().optional().describe('条目在当前世界书内部的 uid，仅在该世界书内有意义。'),
    name: z.string().optional().describe('条目的显示名称。'),
    enabled: z.boolean().optional().describe('条目是否启用。'),
    strategy: z
      .object({
        type: z
          .enum(['constant', 'selective', 'vectorized'])
          .optional()
          .describe('激活策略类型：constant 为常量蓝灯，selective 为关键字绿灯，vectorized 为向量化。'),
        keys: z
          .array(scalarOrRegexSchema)
          .optional()
          .describe('主要关键字。selective 条目至少命中其中一个关键字才会激活。'),
        keys_secondary: z
          .object({
            logic: z
              .enum(['and_any', 'and_all', 'not_all', 'not_any'])
              .optional()
              .describe('次要关键字的匹配逻辑：and_any、and_all、not_all、not_any。'),
            keys: z
              .array(scalarOrRegexSchema)
              .optional()
              .describe('次要关键字列表。若非空，则在主要关键字命中的基础上继续按 logic 判断。'),
          })
          .describe('次要关键字规则。')
          .optional(),
        scan_depth: z
          .number()
          .int()
          .nonnegative()
          .optional()
          .describe(
            `扫描深度。传 ${WORLDBOOK_ENTRY_PATCH_SCAN_DEPTH_SAME_AS_GLOBAL} 表示继承全局设置；1 表示只扫描最后一条消息，2 表示最后两条，以此类推。`,
          ),
      })
      .describe('条目的激活策略：决定条目在何时被触发。')
      .optional(),

    position: z
      .object({
        type: z
          .enum([
            'before_character_definition',
            'after_character_definition',
            'before_example_messages',
            'after_example_messages',
            'before_author_note',
            'after_author_note',
            'at_depth',
            'outlet',
          ])
          .describe(
            '插入位置类型：before/after_character_definition、before/after_example_messages、before/after_author_note、at_depth 或 outlet。',
          )
          .optional(),
        role: z.enum(['system', 'assistant', 'user']).optional().describe('条目的消息身份，仅在 type 为 "at_depth" 时有效。'),
        depth: z.number().int().optional().describe('条目的插入深度，仅在 type 为 "at_depth" 时有效。'),
        order: z.number().int().optional().describe('同一插入位置下的排序值。'),
      })
      .describe('条目的插入位置：决定激活后内容被放入提示词上下文的哪里。')
      .optional(),
    content: z.string().optional().describe('条目激活后插入到上下文中的文本内容。'),
    probability: z.number().optional().describe('条目的激活概率百分比。'),
    recursion: z
      .object({
        prevent_incoming: z.boolean().optional().describe('禁止其他条目通过递归激活本条目。'),
        prevent_outgoing: z.boolean().optional().describe('禁止本条目通过递归激活其他条目。'),
        delay_until: z
          .number()
          .int()
          .nonnegative()
          .optional()
          .describe(`延迟到第 n 级递归检查时才能激活；传 ${WORLDBOOK_ENTRY_PATCH_NULL_SENTINEL} 表示不延迟。`),
      })
      .describe('递归控制：约束条目之间的递归激活行为。')
      .optional(),
    effect: z
      .object({
        sticky: z
          .number()
          .int()
          .nonnegative()
          .optional()
          .describe(`黏性效果：条目激活后，在之后 n 条消息内持续激活；传 ${WORLDBOOK_ENTRY_PATCH_NULL_SENTINEL} 表示关闭。`),
        cooldown: z
          .number()
          .int()
          .nonnegative()
          .optional()
          .describe(`冷却效果：条目激活后，在之后 n 条消息内不能再次激活；传 ${WORLDBOOK_ENTRY_PATCH_NULL_SENTINEL} 表示关闭。`),
        delay: z
          .number()
          .int()
          .nonnegative()
          .optional()
          .describe(`延迟效果：聊天至少有 n 条消息后条目才允许激活；传 ${WORLDBOOK_ENTRY_PATCH_NULL_SENTINEL} 表示关闭。`),
      })
      .describe('激活效果：控制黏性、冷却和聊天轮次延迟。')
      .optional(),
    extra: z.object({}).passthrough().optional().describe('绑定在条目上的额外自定义字段。'),

  })
  .describe('WorldbookEntry 的 lossy patch 版本：对象递归合并、数组整体替换、未提供字段保持原值。')
  .strict();

export const getAttributeArgsSchema = z
  .object({
    file_path: z.string().min(1).describe(entryPathDescription),
  })
  .describe('GetAttribute 工具参数：读取一个世界书条目的完整属性对象。');

export const setAttributeArgsSchema = z
  .object({
    file_path: z.string().min(1).describe(entryPathDescription),
    attributes: worldbookEntryPatchSchema.describe(
      '要应用到条目的属性补丁。对象字段递归合并，数组字段整体替换，未提供字段保持不变。',
    ),
  })
  .describe('SetAttribute 工具参数：以 lossy patch 方式更新世界书条目属性。');

// Make AI Studio Happy
function stripAdditionalPropertiesDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripAdditionalPropertiesDeep);
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const record = value as Record<string, unknown>;
  const next: Record<string, unknown> = {};

  for (const [key, child] of Object.entries(record)) {
    if (key === 'additionalProperties') {
      continue;
    }
    next[key] = stripAdditionalPropertiesDeep(child);
  }

  return next;
}

export function validationSchemaToJson(schema: z.ZodTypeAny): Record<string, any> {
  // SillyTavern 工具注册需要 JSON Schema，因此在注册阶段做一次转换。
  return stripAdditionalPropertiesDeep(
    z.toJSONSchema(schema, {
      target: 'draft-2020-12',
    }),
  ) as Record<string, any>;
}
