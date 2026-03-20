import { z } from 'zod';
import type { TemporalClient } from '../client.js';
import type { ToolResult } from '../types.js';

export const batchOperationToolDefinitions = [
  {
    name: 'list_batch_operations',
    description: 'List batch operations (bulk workflow signal/cancel/terminate/delete jobs) in a namespace.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        namespace: { type: 'string', description: 'Target namespace.' },
        page_size: { type: 'number', description: 'Max results (default 20).' },
        next_page_token: { type: 'string', description: 'Pagination cursor.' },
      },
      required: [],
    },
  },
  {
    name: 'describe_batch_operation',
    description: 'Get details of a batch operation: type, state, progress, and error info.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        namespace: { type: 'string', description: 'Namespace containing the batch operation.' },
        job_id: { type: 'string', description: 'Batch operation job ID.' },
      },
      required: ['job_id'],
    },
  },
  {
    name: 'stop_batch_operation',
    description: 'Stop a running batch operation. The operation will not be rolled back.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        namespace: { type: 'string', description: 'Namespace containing the batch operation.' },
        job_id: { type: 'string', description: 'Batch operation job ID to stop.' },
        reason: { type: 'string', description: 'Reason for stopping the operation.' },
      },
      required: ['job_id'],
    },
  },
];

export const listBatchOperationsSchema = z.object({
  namespace: z.string().optional(),
  page_size: z.number().optional(),
  next_page_token: z.string().optional(),
});

export const describeBatchOperationSchema = z.object({
  namespace: z.string().optional(),
  job_id: z.string(),
});

export const stopBatchOperationSchema = z.object({
  namespace: z.string().optional(),
  job_id: z.string(),
  reason: z.string().optional(),
});

export async function handleListBatchOperations(
  args: z.infer<typeof listBatchOperationsSchema>,
  client: TemporalClient
): Promise<ToolResult> {
  const ns = client.ns(args.namespace);
  const data = await client.get<Record<string, unknown>>(
    `/api/v1/namespaces/${encodeURIComponent(ns)}/batch-operations`,
    { pageSize: args.page_size ?? 20, nextPageToken: args.next_page_token }
  );

  const ops = (data.operationInfo as Record<string, unknown>[] | undefined) ?? [];
  const lines: string[] = [`# Batch Operations in "${ns}" (${ops.length} returned)`, ''];

  for (const op of ops) {
    lines.push(`## ${op.jobId ?? 'unknown'}`);
    if (op.operationType) lines.push(`- Type: ${op.operationType}`);
    if (op.state) lines.push(`- State: ${op.state}`);
    if (op.startTime) lines.push(`- Started: ${op.startTime}`);
    if (op.closeTime) lines.push(`- Closed: ${op.closeTime}`);
    lines.push('');
  }

  if (data.nextPageToken) lines.push(`*Next page token: ${data.nextPageToken}*`);
  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

export async function handleDescribeBatchOperation(
  args: z.infer<typeof describeBatchOperationSchema>,
  client: TemporalClient
): Promise<ToolResult> {
  const ns = client.ns(args.namespace);
  const data = await client.get<Record<string, unknown>>(
    `/api/v1/namespaces/${encodeURIComponent(ns)}/batch-operations/${encodeURIComponent(args.job_id)}`
  );

  const lines: string[] = [`# Batch Operation: ${args.job_id}`, ''];
  if (data.operationType) lines.push(`- Type: ${data.operationType}`);
  if (data.state) lines.push(`- State: ${data.state}`);
  if (data.startTime) lines.push(`- Started: ${data.startTime}`);
  if (data.closeTime) lines.push(`- Closed: ${data.closeTime}`);
  if (data.totalOperationCount !== undefined) lines.push(`- Total: ${data.totalOperationCount}`);
  if (data.completeOperationCount !== undefined) lines.push(`- Completed: ${data.completeOperationCount}`);
  if (data.failureOperationCount !== undefined) lines.push(`- Failed: ${data.failureOperationCount}`);

  const reason = data.reason as string | undefined;
  if (reason) lines.push(`- Reason: ${reason}`);

  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

export async function handleStopBatchOperation(
  args: z.infer<typeof stopBatchOperationSchema>,
  client: TemporalClient
): Promise<ToolResult> {
  const ns = client.ns(args.namespace);
  await client.post(
    `/api/v1/namespaces/${encodeURIComponent(ns)}/batch-operations/${encodeURIComponent(args.job_id)}/stop`,
    { reason: args.reason ?? '' }
  );
  return {
    content: [{
      type: 'text',
      text: `Batch operation "${args.job_id}" stopped${args.reason ? ` (reason: ${args.reason})` : ''}.`,
    }],
  };
}
