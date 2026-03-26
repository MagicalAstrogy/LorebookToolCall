import { z } from 'zod';

import { presetPromptFrontMatterSchema } from '../src/wtc/fs_bind';
import { validationSchemaToJson } from '../src/wtc/schema';

function collectAdditionalPropertiesPaths(value: unknown, path: string[] = []): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectAdditionalPropertiesPaths(item, [...path, String(index)]));
  }

  if (!value || typeof value !== 'object') {
    return [];
  }

  const record = value as Record<string, unknown>;
  const found = Object.prototype.hasOwnProperty.call(record, 'additionalProperties') ? [path.join('.') || '<root>'] : [];

  return [
    ...found,
    ...Object.entries(record).flatMap(([key, child]) => collectAdditionalPropertiesPaths(child, [...path, key])),
  ];
}

describe('validationSchemaToJson', () => {
  test('removes additionalProperties from all generated schema nodes', () => {
    const schema = z.object({
      profile: z.object({
        name: z.string(),
        meta: z.object({
          active: z.boolean(),
        }),
      }),
      items: z.array(
        z.object({
          label: z.string(),
          nested: z.object({
            count: z.number(),
          }),
        }),
      ),
      union: z.union([
        z.object({
          kind: z.literal('a'),
        }),
        z.object({
          kind: z.literal('b'),
          payload: z.object({
            enabled: z.boolean(),
          }),
        }),
      ]),
    });

    const jsonSchema = validationSchemaToJson(schema);

    expect(collectAdditionalPropertiesPaths(jsonSchema)).toStrictEqual([]);
  });

  // 校验导出的 JSON Schema 仍带着 preset.d.ts 中那组内置 ID/role 语义说明。
  test('preserves preset prompt enum semantics in field descriptions', () => {
    const jsonSchema = validationSchemaToJson(presetPromptFrontMatterSchema);
    const properties = jsonSchema.properties as Record<string, { description?: string }>;

    expect(properties.id?.description).toContain('main');
    expect(properties.id?.description).toContain('enhanceDefinitions');
    expect(properties.id?.description).toContain('chatHistory');
    expect(properties.id?.description).toContain('自定义字符串');
    expect(properties.role?.description).toContain('system');
    expect(properties.role?.description).toContain('assistant');
  });
});
