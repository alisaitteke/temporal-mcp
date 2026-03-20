import { z } from 'zod';
import type { TemporalClient } from '../client.js';
import type { ToolResult } from '../types.js';

export const namespaceToolDefinitions = [
  {
    name: 'list_namespaces',
    description: 'List all Temporal namespaces in the cluster.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        page_size: {
          type: 'number',
          description: 'Maximum number of namespaces to return (default 100).',
        },
        next_page_token: {
          type: 'string',
          description: 'Pagination token from a previous list_namespaces call.',
        },
      },
      required: [],
    },
  },
  {
    name: 'describe_namespace',
    description: 'Get detailed configuration and status for a specific namespace.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        namespace: {
          type: 'string',
          description: 'Namespace name (e.g. "default", "my-team").',
        },
      },
      required: ['namespace'],
    },
  },
];

export const listNamespacesSchema = z.object({
  page_size: z.number().optional().describe('Maximum number of namespaces to return'),
  next_page_token: z.string().optional().describe('Pagination cursor from previous call'),
});

export const describeNamespaceSchema = z.object({
  namespace: z.string().describe('Namespace name'),
});

export async function handleListNamespaces(
  args: z.infer<typeof listNamespacesSchema>,
  client: TemporalClient
): Promise<ToolResult> {
  const data = await client.get<Record<string, unknown>>('/api/v1/namespaces', {
    pageSize: args.page_size,
    nextPageToken: args.next_page_token,
  });

  const namespaces = (data.namespaces as Record<string, unknown>[] | undefined) ?? [];
  const lines: string[] = [`# Namespaces (${namespaces.length})`, ''];

  for (const ns of namespaces) {
    const info = ns.namespaceInfo as Record<string, unknown> | undefined;
    const config = ns.config as Record<string, unknown> | undefined;
    lines.push(`## ${info?.name ?? 'unknown'}`);
    if (info?.state) lines.push(`- State: ${info.state}`);
    if (info?.description) lines.push(`- Description: ${info.description}`);
    if (info?.ownerEmail) lines.push(`- Owner: ${info.ownerEmail}`);
    if (config?.workflowExecutionRetentionPeriod)
      lines.push(`- Retention: ${config.workflowExecutionRetentionPeriod}`);
    lines.push('');
  }

  if (data.nextPageToken) {
    lines.push(`*Next page token: ${data.nextPageToken}*`);
  }

  return {
    content: [{ type: 'text', text: lines.join('\n') }],
    structuredContent: {
      namespaces: namespaces.map((ns) => {
        const info = ns.namespaceInfo as Record<string, unknown> | undefined;
        const config = ns.config as Record<string, unknown> | undefined;
        return {
          name: info?.name,
          state: info?.state,
          description: info?.description,
          ownerEmail: info?.ownerEmail,
          retention: config?.workflowExecutionRetentionPeriod,
        };
      }),
      nextPageToken: data.nextPageToken,
    },
  };
}

export async function handleDescribeNamespace(
  args: z.infer<typeof describeNamespaceSchema>,
  client: TemporalClient
): Promise<ToolResult> {
  const ns = args.namespace ?? client.ns();
  const data = await client.get<Record<string, unknown>>(`/api/v1/namespaces/${encodeURIComponent(ns)}`);

  const info = data.namespaceInfo as Record<string, unknown> | undefined;
  const config = data.config as Record<string, unknown> | undefined;
  const repConfig = data.replicationConfig as Record<string, unknown> | undefined;

  const lines: string[] = [`# Namespace: ${info?.name ?? ns}`, ''];

  if (info?.state) lines.push(`- State: ${info.state}`);
  if (info?.description) lines.push(`- Description: ${info.description}`);
  if (info?.ownerEmail) lines.push(`- Owner Email: ${info.ownerEmail}`);
  if (config?.workflowExecutionRetentionPeriod)
    lines.push(`- Workflow Retention: ${config.workflowExecutionRetentionPeriod}`);
  if (repConfig?.activeClusterName)
    lines.push(`- Active Cluster: ${repConfig.activeClusterName}`);

  const clusters = repConfig?.clusters as unknown[] | undefined;
  if (clusters?.length) {
    lines.push(`- Clusters: ${clusters.map((c) => (c as Record<string, unknown>).clusterName).join(', ')}`);
  }

  return { content: [{ type: 'text', text: lines.join('\n') }] };
}
