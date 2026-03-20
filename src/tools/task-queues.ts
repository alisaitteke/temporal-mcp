import { z } from 'zod';
import type { TemporalClient } from '../client.js';
import type { ToolResult } from '../types.js';

export const taskQueueToolDefinitions = [
  {
    name: 'describe_task_queue',
    description:
      'Get task queue information: active pollers, backlog, and task queue type. Useful for diagnosing worker connectivity issues.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        namespace: { type: 'string', description: 'Target namespace.' },
        task_queue: { type: 'string', description: 'Task queue name.' },
        task_queue_type: {
          type: 'string',
          enum: ['WORKFLOW', 'ACTIVITY'],
          description: 'Task queue type. Defaults to WORKFLOW.',
        },
      },
      required: ['task_queue'],
    },
  },
];

export const describeTaskQueueSchema = z.object({
  namespace: z.string().optional(),
  task_queue: z.string(),
  task_queue_type: z.enum(['WORKFLOW', 'ACTIVITY']).optional(),
});

export async function handleDescribeTaskQueue(
  args: z.infer<typeof describeTaskQueueSchema>,
  client: TemporalClient
): Promise<ToolResult> {
  const ns = client.ns(args.namespace);
  const data = await client.get<Record<string, unknown>>(
    `/api/v1/namespaces/${encodeURIComponent(ns)}/task-queues/${encodeURIComponent(args.task_queue)}`,
    { taskQueueType: args.task_queue_type ?? 'WORKFLOW' }
  );

  const lines: string[] = [`# Task Queue: ${args.task_queue}`, ''];

  const pollers = (data.pollers as Record<string, unknown>[] | undefined) ?? [];
  lines.push(`- Active Pollers: ${pollers.length}`);

  if (pollers.length > 0) {
    lines.push('', '## Pollers');
    for (const poller of pollers) {
      lines.push(`- Identity: ${poller.identity ?? 'unknown'}`);
      if (poller.lastAccessTime) lines.push(`  Last Access: ${poller.lastAccessTime}`);
      if (poller.ratePerSecond !== undefined) lines.push(`  Rate: ${poller.ratePerSecond} tasks/s`);
    }
  }

  const taskIdBlock = data.taskIdBlock as Record<string, unknown> | undefined;
  if (taskIdBlock) {
    lines.push('', '## Task ID Block');
    if (taskIdBlock.startId !== undefined) lines.push(`- Start ID: ${taskIdBlock.startId}`);
    if (taskIdBlock.endId !== undefined) lines.push(`- End ID: ${taskIdBlock.endId}`);
  }

  return { content: [{ type: 'text', text: lines.join('\n') }] };
}
