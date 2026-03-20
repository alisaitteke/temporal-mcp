import { z } from 'zod';
import type { TemporalClient } from '../client.js';
import type { ToolResult } from '../types.js';

export const nexusEndpointToolDefinitions = [
  {
    name: 'list_nexus_endpoints',
    description: 'List all Nexus endpoints registered in the cluster. Nexus endpoints connect Temporal namespaces to external services.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        page_size: { type: 'number', description: 'Max results (default 20).' },
        next_page_token: { type: 'string', description: 'Pagination cursor.' },
      },
      required: [],
    },
  },
  {
    name: 'get_nexus_endpoint',
    description: 'Get details of a specific Nexus endpoint by ID.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'Nexus endpoint ID.' },
      },
      required: ['id'],
    },
  },
  {
    name: 'create_nexus_endpoint',
    description: 'Create a new Nexus endpoint that routes to a target namespace and task queue.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Unique endpoint name.' },
        target_namespace: { type: 'string', description: 'Target Temporal namespace.' },
        target_task_queue: { type: 'string', description: 'Target task queue in the target namespace.' },
        description: { type: 'string', description: 'Human-readable description.' },
      },
      required: ['name', 'target_namespace', 'target_task_queue'],
    },
  },
  {
    name: 'delete_nexus_endpoint',
    description: 'Delete a Nexus endpoint by ID.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'Nexus endpoint ID to delete.' },
        version: { type: 'string', description: 'Current version for optimistic concurrency (required).' },
      },
      required: ['id', 'version'],
    },
  },
];

export const listNexusEndpointsSchema = z.object({
  page_size: z.number().optional(),
  next_page_token: z.string().optional(),
});

export const getNexusEndpointSchema = z.object({
  id: z.string(),
});

export const createNexusEndpointSchema = z.object({
  name: z.string(),
  target_namespace: z.string(),
  target_task_queue: z.string(),
  description: z.string().optional(),
});

export const deleteNexusEndpointSchema = z.object({
  id: z.string(),
  version: z.string(),
});

function formatEndpoint(ep: Record<string, unknown>): string[] {
  const lines: string[] = [];
  const spec = ep.spec as Record<string, unknown> | undefined;
  const target = spec?.target as Record<string, unknown> | undefined;
  const worker = target?.worker as Record<string, unknown> | undefined;

  lines.push(`- ID: ${ep.id}`);
  if (spec?.name) lines.push(`- Name: ${spec.name}`);
  if (ep.createdTime) lines.push(`- Created: ${ep.createdTime}`);
  if (ep.lastModifiedTime) lines.push(`- Last Modified: ${ep.lastModifiedTime}`);
  if (worker?.namespace) lines.push(`- Target Namespace: ${worker.namespace}`);
  if (worker?.taskQueue) lines.push(`- Target Task Queue: ${worker.taskQueue}`);
  return lines;
}

export async function handleListNexusEndpoints(
  args: z.infer<typeof listNexusEndpointsSchema>,
  client: TemporalClient
): Promise<ToolResult> {
  const data = await client.get<Record<string, unknown>>(
    '/api/v1/nexus/endpoints',
    { pageSize: args.page_size ?? 20, nextPageToken: args.next_page_token }
  );

  const endpoints = (data.endpoints as Record<string, unknown>[] | undefined) ?? [];
  const lines: string[] = [`# Nexus Endpoints (${endpoints.length} returned)`, ''];

  for (const ep of endpoints) {
    const spec = ep.spec as Record<string, unknown> | undefined;
    lines.push(`## ${spec?.name ?? ep.id ?? 'unknown'}`);
    lines.push(...formatEndpoint(ep));
    lines.push('');
  }

  if (data.nextPageToken) lines.push(`*Next page token: ${data.nextPageToken}*`);
  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

export async function handleGetNexusEndpoint(
  args: z.infer<typeof getNexusEndpointSchema>,
  client: TemporalClient
): Promise<ToolResult> {
  const data = await client.get<Record<string, unknown>>(
    `/api/v1/nexus/endpoints/${encodeURIComponent(args.id)}`
  );

  const ep = data.endpoint as Record<string, unknown> | undefined ?? data;
  const spec = ep.spec as Record<string, unknown> | undefined;
  const lines: string[] = [`# Nexus Endpoint: ${spec?.name ?? args.id}`, ''];
  lines.push(...formatEndpoint(ep));

  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

export async function handleCreateNexusEndpoint(
  args: z.infer<typeof createNexusEndpointSchema>,
  client: TemporalClient
): Promise<ToolResult> {
  const body = {
    spec: {
      name: args.name,
      description: args.description ? { value: args.description } : undefined,
      target: {
        worker: {
          namespace: args.target_namespace,
          taskQueue: args.target_task_queue,
        },
      },
    },
  };

  const data = await client.post<Record<string, unknown>>('/api/v1/nexus/endpoints', body);
  const ep = data.endpoint as Record<string, unknown> | undefined ?? data;

  return {
    content: [{
      type: 'text',
      text: `Nexus endpoint "${args.name}" created. ID: ${ep.id ?? 'N/A'}, Target: ${args.target_namespace}/${args.target_task_queue}`,
    }],
  };
}

export async function handleDeleteNexusEndpoint(
  args: z.infer<typeof deleteNexusEndpointSchema>,
  client: TemporalClient
): Promise<ToolResult> {
  await client.delete(
    `/api/v1/nexus/endpoints/${encodeURIComponent(args.id)}`,
    { version: args.version }
  );
  return {
    content: [{ type: 'text', text: `Nexus endpoint "${args.id}" deleted.` }],
  };
}
