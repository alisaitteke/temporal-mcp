import { z } from 'zod';
import type { TemporalClient } from '../client.js';
import type { ToolResult } from '../types.js';

export const scheduleToolDefinitions = [
  {
    name: 'list_schedules',
    description: 'List all schedules in a namespace.',
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
    name: 'describe_schedule',
    description: 'Get full details of a specific schedule including spec, actions, state, and upcoming run times.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        namespace: { type: 'string', description: 'Namespace containing the schedule.' },
        schedule_id: { type: 'string', description: 'Schedule ID.' },
      },
      required: ['schedule_id'],
    },
  },
  {
    name: 'create_schedule',
    description:
      'Create a new schedule that starts a workflow on a recurring basis. The schedule_spec uses cron-style spec or interval.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        namespace: { type: 'string', description: 'Target namespace.' },
        schedule_id: { type: 'string', description: 'Unique schedule ID.' },
        cron_expression: {
          type: 'string',
          description: 'Cron expression (e.g. "0 * * * *" for every hour). Use this OR interval_seconds.',
        },
        interval_seconds: {
          type: 'number',
          description: 'Run interval in seconds (e.g. 3600 for every hour). Use this OR cron_expression.',
        },
        workflow_type: { type: 'string', description: 'Workflow type to start on each trigger.' },
        workflow_id_prefix: {
          type: 'string',
          description: 'Prefix for workflow IDs (schedule ID used if omitted).',
        },
        task_queue: { type: 'string', description: 'Task queue for the triggered workflows.' },
        input: { description: 'Input payload for triggered workflows.' },
        paused: { type: 'boolean', description: 'Create the schedule in a paused state (default false).' },
        notes: { type: 'string', description: 'Human-readable notes.' },
      },
      required: ['schedule_id', 'workflow_type', 'task_queue'],
    },
  },
  {
    name: 'delete_schedule',
    description: 'Delete a schedule. This does not affect any workflow executions already started by the schedule.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        namespace: { type: 'string', description: 'Namespace containing the schedule.' },
        schedule_id: { type: 'string', description: 'Schedule ID to delete.' },
      },
      required: ['schedule_id'],
    },
  },
];

export const listSchedulesSchema = z.object({
  namespace: z.string().optional(),
  page_size: z.number().optional(),
  next_page_token: z.string().optional(),
});

export const describeScheduleSchema = z.object({
  namespace: z.string().optional(),
  schedule_id: z.string(),
});

export const createScheduleSchema = z.object({
  namespace: z.string().optional(),
  schedule_id: z.string(),
  cron_expression: z.string().optional(),
  interval_seconds: z.number().optional(),
  workflow_type: z.string(),
  workflow_id_prefix: z.string().optional(),
  task_queue: z.string(),
  input: z.unknown().optional(),
  paused: z.boolean().optional(),
  notes: z.string().optional(),
});

export const deleteScheduleSchema = z.object({
  namespace: z.string().optional(),
  schedule_id: z.string(),
});

export async function handleListSchedules(
  args: z.infer<typeof listSchedulesSchema>,
  client: TemporalClient
): Promise<ToolResult> {
  const ns = client.ns(args.namespace);
  const data = await client.get<Record<string, unknown>>(
    `/api/v1/namespaces/${encodeURIComponent(ns)}/schedules`,
    { pageSize: args.page_size ?? 20, nextPageToken: args.next_page_token }
  );

  const schedules = (data.schedules as Record<string, unknown>[] | undefined) ?? [];
  const lines: string[] = [`# Schedules in "${ns}" (${schedules.length} returned)`, ''];

  for (const s of schedules) {
    const info = s.info as Record<string, unknown> | undefined;
    lines.push(`## ${s.scheduleId ?? 'unknown'}`);
    if (info?.workflowType) {
      const wt = info.workflowType as Record<string, unknown>;
      lines.push(`- Workflow Type: ${wt.name ?? info.workflowType}`);
    }
    const state = s.state as Record<string, unknown> | undefined;
    if (state?.paused !== undefined) lines.push(`- Paused: ${state.paused}`);
    if (info?.recentActions) {
      const recent = info.recentActions as unknown[];
      lines.push(`- Recent Actions: ${recent.length}`);
    }
    if (info?.futureActionTimes) {
      const times = info.futureActionTimes as string[];
      if (times.length > 0) lines.push(`- Next Run: ${times[0]}`);
    }
    lines.push('');
  }

  if (data.nextPageToken) lines.push(`*Next page token: ${data.nextPageToken}*`);
  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

export async function handleDescribeSchedule(
  args: z.infer<typeof describeScheduleSchema>,
  client: TemporalClient
): Promise<ToolResult> {
  const ns = client.ns(args.namespace);
  const data = await client.get<Record<string, unknown>>(
    `/api/v1/namespaces/${encodeURIComponent(ns)}/schedules/${encodeURIComponent(args.schedule_id)}`
  );

  const schedule = data.schedule as Record<string, unknown> | undefined;
  const spec = schedule?.spec as Record<string, unknown> | undefined;
  const action = schedule?.action as Record<string, unknown> | undefined;
  const state = schedule?.state as Record<string, unknown> | undefined;
  const info = data.info as Record<string, unknown> | undefined;

  const lines: string[] = [`# Schedule: ${args.schedule_id}`, ''];

  if (state?.paused !== undefined) lines.push(`- Paused: ${state.paused}`);
  if (state?.notes) lines.push(`- Notes: ${state.notes}`);

  if (spec) {
    lines.push('', '## Spec');
    const cronStrings = spec.cronString as string[] | undefined;
    if (cronStrings?.length) lines.push(`- Cron: ${cronStrings.join(', ')}`);
    const intervals = spec.interval as unknown[] | undefined;
    if (intervals?.length) {
      intervals.forEach((iv) => {
        const i = iv as Record<string, unknown>;
        lines.push(`- Interval: ${i.interval ?? JSON.stringify(i)}`);
      });
    }
  }

  if (action) {
    lines.push('', '## Action');
    const startWorkflow = action.startWorkflow as Record<string, unknown> | undefined;
    if (startWorkflow) {
      const wt = startWorkflow.workflowType as Record<string, unknown> | undefined;
      if (wt?.name) lines.push(`- Workflow Type: ${wt.name}`);
      const tq = startWorkflow.taskQueue as Record<string, unknown> | undefined;
      if (tq?.name) lines.push(`- Task Queue: ${tq.name}`);
    }
  }

  if (info) {
    const future = info.futureActionTimes as string[] | undefined;
    if (future?.length) {
      lines.push('', '## Upcoming Runs');
      future.slice(0, 5).forEach((t) => lines.push(`- ${t}`));
    }
    const recent = info.recentActions as Record<string, unknown>[] | undefined;
    if (recent?.length) {
      lines.push('', `## Recent Actions (${recent.length})`);
      recent.slice(0, 5).forEach((a) => {
        lines.push(`- ${a.scheduleTime ?? JSON.stringify(a)}`);
      });
    }
  }

  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

function encodePayload(value: unknown): { metadata: { encoding: string }; data: string } {
  return {
    metadata: { encoding: Buffer.from('json/plain').toString('base64') },
    data: Buffer.from(JSON.stringify(value)).toString('base64'),
  };
}

export async function handleCreateSchedule(
  args: z.infer<typeof createScheduleSchema>,
  client: TemporalClient
): Promise<ToolResult> {
  const ns = client.ns(args.namespace);

  const spec: Record<string, unknown> = {};
  if (args.cron_expression) spec.cronString = [args.cron_expression];
  if (args.interval_seconds) spec.interval = [{ interval: `${args.interval_seconds}s` }];

  const startWorkflow: Record<string, unknown> = {
    workflowType: { name: args.workflow_type },
    taskQueue: { name: args.task_queue },
    workflowId: `${args.workflow_id_prefix ?? args.schedule_id}-${Date.now()}`,
  };
  if (args.input !== undefined) {
    startWorkflow.input = { payloads: [encodePayload(args.input)] };
  }

  const body: Record<string, unknown> = {
    schedule: {
      spec,
      action: { startWorkflow },
      state: {
        paused: args.paused ?? false,
        notes: args.notes ?? '',
      },
    },
  };

  await client.post(
    `/api/v1/namespaces/${encodeURIComponent(ns)}/schedules/${encodeURIComponent(args.schedule_id)}`,
    body
  );

  return {
    content: [{
      type: 'text',
      text: `Schedule "${args.schedule_id}" created in namespace "${ns}". Workflow type: ${args.workflow_type}, Task queue: ${args.task_queue}.`,
    }],
  };
}

export async function handleDeleteSchedule(
  args: z.infer<typeof deleteScheduleSchema>,
  client: TemporalClient
): Promise<ToolResult> {
  const ns = client.ns(args.namespace);
  await client.delete(
    `/api/v1/namespaces/${encodeURIComponent(ns)}/schedules/${encodeURIComponent(args.schedule_id)}`
  );

  return {
    content: [{
      type: 'text',
      text: `Schedule "${args.schedule_id}" deleted from namespace "${ns}".`,
    }],
  };
}
