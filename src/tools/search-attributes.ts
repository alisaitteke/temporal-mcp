import { z } from 'zod';
import type { TemporalClient } from '../client.js';
import type { ToolResult } from '../types.js';

export const searchAttributeToolDefinitions = [
  {
    name: 'list_search_attributes',
    description:
      'List all custom and system search attributes for a namespace. Search attributes are used in workflow visibility queries.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        namespace: {
          type: 'string',
          description: 'Target namespace. Defaults to TEMPORAL_NAMESPACE.',
        },
      },
      required: [],
    },
  },
];

export const listSearchAttributesSchema = z.object({
  namespace: z.string().optional(),
});

/** Mapping from Temporal's IndexedValueType enum values to readable strings. */
const VALUE_TYPE_LABELS: Record<string, string> = {
  INDEXED_VALUE_TYPE_TEXT: 'Text',
  INDEXED_VALUE_TYPE_KEYWORD: 'Keyword',
  INDEXED_VALUE_TYPE_INT: 'Int',
  INDEXED_VALUE_TYPE_DOUBLE: 'Double',
  INDEXED_VALUE_TYPE_BOOL: 'Bool',
  INDEXED_VALUE_TYPE_DATETIME: 'Datetime',
  INDEXED_VALUE_TYPE_KEYWORD_LIST: 'KeywordList',
  '1': 'Text', '2': 'Keyword', '3': 'Int', '4': 'Double',
  '5': 'Bool', '6': 'Datetime', '7': 'KeywordList',
};

function labelType(t: string): string {
  return VALUE_TYPE_LABELS[t] ?? t;
}

export async function handleListSearchAttributes(
  args: z.infer<typeof listSearchAttributesSchema>,
  client: TemporalClient
): Promise<ToolResult> {
  const ns = client.ns(args.namespace);
  const data = await client.get<Record<string, unknown>>(
    `/api/v1/namespaces/${encodeURIComponent(ns)}/search-attributes`
  );

  const custom = data.customAttributes as Record<string, string> | undefined;
  const system = data.systemAttributes as Record<string, string> | undefined;

  const lines: string[] = [`# Search Attributes in "${ns}"`, ''];

  if (custom && Object.keys(custom).length > 0) {
    lines.push('## Custom Attributes');
    for (const [name, type] of Object.entries(custom)) {
      lines.push(`- ${name}: ${labelType(type)}`);
    }
    lines.push('');
  }

  if (system && Object.keys(system).length > 0) {
    lines.push('## System Attributes');
    for (const [name, type] of Object.entries(system)) {
      lines.push(`- ${name}: ${labelType(type)}`);
    }
  }

  if ((!custom || Object.keys(custom).length === 0) && (!system || Object.keys(system).length === 0)) {
    lines.push('No search attributes found.');
  }

  return { content: [{ type: 'text', text: lines.join('\n') }] };
}
