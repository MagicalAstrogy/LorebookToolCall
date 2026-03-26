import { z } from 'zod';

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
});
