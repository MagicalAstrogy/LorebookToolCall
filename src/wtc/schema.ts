import { z } from 'zod';

export const globArgsSchema = z.object({
  pattern: z.string().min(1),
  path: z.string().optional(),
});

export const grepArgsSchema = z.object({
  pattern: z.string().min(1),
  path: z.string().min(1),
  glob: z.string().optional(),
  type: z.string().optional(),
  output_mode: z.enum(['content', 'files_with_matches', 'count']).optional(),
  '-B': z.number().int().nonnegative().optional(),
  '-A': z.number().int().nonnegative().optional(),
  '-C': z.number().int().nonnegative().optional(),
  context: z.number().int().nonnegative().optional(),
  '-n': z.boolean().optional(),
  '-i': z.boolean().optional(),
  head_limit: z.number().int().nonnegative().optional(),
  offset: z.number().int().nonnegative().optional(),
  multiline: z.boolean().optional(),
});

export const readArgsSchema = z.object({
  file_path: z.string().min(1),
  offset: z.number().int().optional(),
  limit: z.number().int().optional(),
});

export const writeArgsSchema = z.object({
  file_path: z.string().min(1),
  content: z.string(),
});

export const editArgsSchema = z.object({
  file_path: z.string().min(1),
  old_string: z.string(),
  new_string: z.string(),
  replace_all: z.boolean().optional(),
});

export const deleteArgsSchema = z.object({
  file_path: z.string().min(1),
});

export const createLorebookArgsSchema = z.object({
  lorebook_name: z.string().min(1),
});

export const askUserQuestionArgsSchema = z.object({
  question: z.string().min(1),
});

const scalarOrRegexSchema = z.string();

export const worldbookEntryPatchSchema: z.ZodType<any> = z
  .object({
    uid: z.number().int().optional(),
    name: z.string().optional(),
    enabled: z.boolean().optional(),
    strategy: z
      .object({
        type: z.enum(['constant', 'selective', 'vectorized']).optional(),
        keys: z.array(scalarOrRegexSchema).optional(),
        keys_secondary: z
          .object({
            logic: z.enum(['and_any', 'and_all', 'not_all', 'not_any']).optional(),
            keys: z.array(scalarOrRegexSchema).optional(),
          })
          .optional(),
        scan_depth: z.union([z.literal('same_as_global'), z.number().int()]).optional(),
      })
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
          .optional(),
        role: z.enum(['system', 'assistant', 'user']).optional(),
        depth: z.number().int().optional(),
        order: z.number().int().optional(),
      })
      .optional(),
    content: z.string().optional(),
    probability: z.number().optional(),
    recursion: z
      .object({
        prevent_incoming: z.boolean().optional(),
        prevent_outgoing: z.boolean().optional(),
        delay_until: z.union([z.number().int(), z.null()]).optional(),
      })
      .optional(),
    effect: z
      .object({
        sticky: z.union([z.number().int(), z.null()]).optional(),
        cooldown: z.union([z.number().int(), z.null()]).optional(),
        delay: z.union([z.number().int(), z.null()]).optional(),
      })
      .optional(),
    extra: z.record(z.string(), z.any()).optional(),
  })
  .strict();

export const getAttributeArgsSchema = z.object({
  file_path: z.string().min(1),
});

export const setAttributeArgsSchema = z.object({
  file_path: z.string().min(1),
  attributes: worldbookEntryPatchSchema,
});

export function validationSchemaToJson(schema: z.ZodTypeAny): Record<string, any> {
  return z.toJSONSchema(schema, {
    target: 'draft-7',
  }) as Record<string, any>;
}
