import { z } from 'zod';
import type { TemporalClient } from '../client.js';
import type { ToolResult } from '../types.js';

export const activityToolDefinitions = [
  {
    name: 'list_activities',
    description:
      'List activity executions in a namespace. Use the query parameter to filter by workflow ID, activity type, status, etc.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        namespace: { type: 'string', description: 'Target namespace.' },
        query: {
          type: 'string',
          description: 'Visibility query filter (e.g. "WorkflowId=\'my-workflow\' AND ActivityType=\'SendEmail\'").',
        },
        page_size: { type: 'number', description: 'Max results (default 20).' },
        next_page_token: { type: 'string', description: 'Pagination cursor.' },
      },
      required: [],
    },
  },
  {
    name: 'describe_activity',
    description: 'Get details of a specific activity execution: type, status, schedule/start time, heartbeat, and failure info.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        namespace: { type: 'string', description: 'Namespace containing the activity.' },
        activity_id: { type: 'string', description: 'Activity ID.' },
      },
      required: ['activity_id'],
    },
  },
];

export const listActivitiesSchema = z.object({
  namespace: z.string().optional(),
  query: z.string().optional(),
  page_size: z.number().optional(),
  next_page_token: z.string().optional(),
});

export const describeActivitySchema = z.object({
  namespace: z.string().optional(),
  activity_id: z.string(),
});

function fmtTime(t: unknown): string {
  if (!t) return 'N/A';
  if (typeof t === 'string') return new Date(t).toISOString();
  if (typeof t === 'object') {
    const o = t as Record<string, unknown>;
    if (o.seconds) return new Date(Number(o.seconds) * 1000).toISOString();
  }
  return String(t);
}

export async function handleListActivities(
  args: z.infer<typeof listActivitiesSchema>,
  client: TemporalClient
): Promise<ToolResult> {
  const ns = client.ns(args.namespace);
  const data = await client.get<Record<string, unknown>>(
    `/api/v1/namespaces/${encodeURIComponent(ns)}/activities`,
    { query: args.query, pageSize: args.page_size ?? 20, nextPageToken: args.next_page_token }
  );

  const activities = (data.activityExecutions as Record<string, unknown>[] | undefined) ?? [];
  const lines: string[] = [`# Activities in "${ns}" (${activities.length} returned)`, ''];

  for (const act of activities) {
    const actType = act.activityType as Record<string, unknown> | undefined;
    const exec = act.execution as Record<string, unknown> | undefined;
    lines.push(`## ${act.activityId ?? 'unknown'}`);
    if (actType?.name) lines.push(`- Type: ${actType.name}`);
    if (exec?.workflowId) lines.push(`- Workflow: ${exec.workflowId}`);
    if (act.state) lines.push(`- State: ${act.state}`);
    if (act.scheduleTime) lines.push(`- Scheduled: ${fmtTime(act.scheduleTime)}`);
    if (act.startTime) lines.push(`- Started: ${fmtTime(act.startTime)}`);
    lines.push('');
  }

  if (data.nextPageToken) lines.push(`*Next page token: ${data.nextPageToken}*`);
  return {
    content: [{ type: 'text', text: lines.join('\n') }],
    structuredContent: {
      namespace: ns,
      activities: activities.map((act) => {
        const actType = act.activityType as Record<string, unknown> | undefined;
        const exec = act.execution as Record<string, unknown> | undefined;
        return {
          activityId: act.activityId,
          type: actType?.name,
          workflowId: exec?.workflowId,
          state: act.state,
          scheduleTime: act.scheduleTime,
          startTime: act.startTime,
        };
      }),
      nextPageToken: data.nextPageToken,
    },
  };
}

export async function handleDescribeActivity(
  args: z.infer<typeof describeActivitySchema>,
  client: TemporalClient
): Promise<ToolResult> {
  const ns = client.ns(args.namespace);
  const data = await client.get<Record<string, unknown>>(
    `/api/v1/namespaces/${encodeURIComponent(ns)}/activities/${encodeURIComponent(args.activity_id)}`
  );

  const actType = data.activityType as Record<string, unknown> | undefined;
  const exec = data.execution as Record<string, unknown> | undefined;
  const failure = data.failure as Record<string, unknown> | undefined;
  const heartbeat = data.lastHeartbeatDetails as Record<string, unknown> | undefined;

  const lines: string[] = [`# Activity: ${args.activity_id}`, ''];
  if (actType?.name) lines.push(`- Type: ${actType.name}`);
  if (exec?.workflowId) lines.push(`- Workflow: ${exec.workflowId}`);
  if (exec?.runId) lines.push(`- Run ID: ${exec.runId}`);
  if (data.state) lines.push(`- State: ${data.state}`);
  if (data.scheduleTime) lines.push(`- Scheduled: ${fmtTime(data.scheduleTime)}`);
  if (data.startTime) lines.push(`- Started: ${fmtTime(data.startTime)}`);
  if (data.attempt !== undefined) lines.push(`- Attempt: ${data.attempt}`);
  if (data.maxAttempts !== undefined) lines.push(`- Max Attempts: ${data.maxAttempts}`);
  if (heartbeat) lines.push(`- Last Heartbeat: ${JSON.stringify(heartbeat)}`);
  if (failure?.message) {
    lines.push('', '## Failure');
    lines.push(`- Message: ${failure.message}`);
    if (failure.applicationFailureInfo) {
      const info = failure.applicationFailureInfo as Record<string, unknown>;
      if (info.type) lines.push(`- Failure Type: ${info.type}`);
    }
  }

  return { content: [{ type: 'text', text: lines.join('\n') }] };
}
