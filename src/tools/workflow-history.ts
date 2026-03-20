import { z } from 'zod';
import type { TemporalClient } from '../client.js';
import type { ToolResult } from '../types.js';

export const historyToolDefinitions = [
  {
    name: 'get_workflow_history',
    description:
      'Get the event history of a workflow execution. Useful for debugging failures, understanding execution flow, and auditing. Returns a human-readable summary of history events.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        namespace: { type: 'string', description: 'Namespace containing the workflow.' },
        workflow_id: { type: 'string', description: 'Workflow ID.' },
        run_id: { type: 'string', description: 'Specific run ID (optional, uses latest run if omitted).' },
        reverse: {
          type: 'boolean',
          description: 'If true, return history in reverse chronological order (most recent first). Useful for checking the latest events of a long-running workflow.',
        },
        page_size: {
          type: 'number',
          description: 'Maximum number of history events to return (default 50).',
        },
        next_page_token: {
          type: 'string',
          description: 'Pagination cursor from a previous get_workflow_history call.',
        },
      },
      required: ['workflow_id'],
    },
  },
];

export const getWorkflowHistorySchema = z.object({
  namespace: z.string().optional(),
  workflow_id: z.string(),
  run_id: z.string().optional(),
  reverse: z.boolean().optional(),
  page_size: z.number().optional(),
  next_page_token: z.string().optional(),
});

/** Friendly display names for Temporal event types. */
const EVENT_TYPE_LABELS: Record<string, string> = {
  EVENT_TYPE_WORKFLOW_EXECUTION_STARTED: 'WorkflowExecutionStarted',
  EVENT_TYPE_WORKFLOW_EXECUTION_COMPLETED: 'WorkflowExecutionCompleted',
  EVENT_TYPE_WORKFLOW_EXECUTION_FAILED: 'WorkflowExecutionFailed',
  EVENT_TYPE_WORKFLOW_EXECUTION_TIMED_OUT: 'WorkflowExecutionTimedOut',
  EVENT_TYPE_WORKFLOW_EXECUTION_CANCELED: 'WorkflowExecutionCanceled',
  EVENT_TYPE_WORKFLOW_EXECUTION_TERMINATED: 'WorkflowExecutionTerminated',
  EVENT_TYPE_WORKFLOW_EXECUTION_CONTINUED_AS_NEW: 'WorkflowExecutionContinuedAsNew',
  EVENT_TYPE_WORKFLOW_TASK_SCHEDULED: 'WorkflowTaskScheduled',
  EVENT_TYPE_WORKFLOW_TASK_STARTED: 'WorkflowTaskStarted',
  EVENT_TYPE_WORKFLOW_TASK_COMPLETED: 'WorkflowTaskCompleted',
  EVENT_TYPE_WORKFLOW_TASK_FAILED: 'WorkflowTaskFailed',
  EVENT_TYPE_WORKFLOW_TASK_TIMED_OUT: 'WorkflowTaskTimedOut',
  EVENT_TYPE_ACTIVITY_TASK_SCHEDULED: 'ActivityTaskScheduled',
  EVENT_TYPE_ACTIVITY_TASK_STARTED: 'ActivityTaskStarted',
  EVENT_TYPE_ACTIVITY_TASK_COMPLETED: 'ActivityTaskCompleted',
  EVENT_TYPE_ACTIVITY_TASK_FAILED: 'ActivityTaskFailed',
  EVENT_TYPE_ACTIVITY_TASK_TIMED_OUT: 'ActivityTaskTimedOut',
  EVENT_TYPE_ACTIVITY_TASK_CANCEL_REQUESTED: 'ActivityTaskCancelRequested',
  EVENT_TYPE_ACTIVITY_TASK_CANCELED: 'ActivityTaskCanceled',
  EVENT_TYPE_TIMER_STARTED: 'TimerStarted',
  EVENT_TYPE_TIMER_FIRED: 'TimerFired',
  EVENT_TYPE_TIMER_CANCELED: 'TimerCanceled',
  EVENT_TYPE_SIGNAL_EXTERNAL_WORKFLOW_EXECUTION_INITIATED: 'SignalExternalWorkflowInitiated',
  EVENT_TYPE_WORKFLOW_EXECUTION_SIGNALED: 'WorkflowExecutionSignaled',
  EVENT_TYPE_START_CHILD_WORKFLOW_EXECUTION_INITIATED: 'StartChildWorkflowInitiated',
  EVENT_TYPE_CHILD_WORKFLOW_EXECUTION_STARTED: 'ChildWorkflowStarted',
  EVENT_TYPE_CHILD_WORKFLOW_EXECUTION_COMPLETED: 'ChildWorkflowCompleted',
  EVENT_TYPE_CHILD_WORKFLOW_EXECUTION_FAILED: 'ChildWorkflowFailed',
  EVENT_TYPE_CHILD_WORKFLOW_EXECUTION_CANCELED: 'ChildWorkflowCanceled',
  EVENT_TYPE_CHILD_WORKFLOW_EXECUTION_TERMINATED: 'ChildWorkflowTerminated',
  EVENT_TYPE_CHILD_WORKFLOW_EXECUTION_TIMED_OUT: 'ChildWorkflowTimedOut',
};

function labelEvent(eventType: string): string {
  return EVENT_TYPE_LABELS[eventType] ?? eventType.replace(/^EVENT_TYPE_/, '');
}

/** Extract a brief detail string from an event's attributes. */
function eventDetail(event: Record<string, unknown>): string {
  const type = event.eventType as string | undefined;
  if (!type) return '';

  // Activity scheduled: show activity type
  if (type === 'EVENT_TYPE_ACTIVITY_TASK_SCHEDULED') {
    const attr = event.activityTaskScheduledEventAttributes as Record<string, unknown> | undefined;
    const actType = attr?.activityType as Record<string, unknown> | undefined;
    if (actType?.name) return ` → ${actType.name}`;
    if (attr?.activityId) return ` id=${attr.activityId}`;
  }

  // Activity failed: show error
  if (type === 'EVENT_TYPE_ACTIVITY_TASK_FAILED') {
    const attr = event.activityTaskFailedEventAttributes as Record<string, unknown> | undefined;
    const failure = attr?.failure as Record<string, unknown> | undefined;
    if (failure?.message) return ` ✗ ${failure.message}`;
  }

  // Workflow failed
  if (type === 'EVENT_TYPE_WORKFLOW_EXECUTION_FAILED') {
    const attr = event.workflowExecutionFailedEventAttributes as Record<string, unknown> | undefined;
    const failure = attr?.failure as Record<string, unknown> | undefined;
    if (failure?.message) return ` ✗ ${failure.message}`;
  }

  // Signal received
  if (type === 'EVENT_TYPE_WORKFLOW_EXECUTION_SIGNALED') {
    const attr = event.workflowExecutionSignaledEventAttributes as Record<string, unknown> | undefined;
    if (attr?.signalName) return ` "${attr.signalName}"`;
  }

  // Timer
  if (type === 'EVENT_TYPE_TIMER_STARTED') {
    const attr = event.timerStartedEventAttributes as Record<string, unknown> | undefined;
    if (attr?.startToFireTimeout) return ` timeout=${attr.startToFireTimeout}`;
  }

  return '';
}

function fmtTime(t: unknown): string {
  if (!t) return '';
  if (typeof t === 'string') return new Date(t).toISOString();
  if (typeof t === 'object') {
    const obj = t as Record<string, unknown>;
    if (obj.seconds) return new Date(Number(obj.seconds) * 1000).toISOString();
  }
  return String(t);
}

export async function handleGetWorkflowHistory(
  args: z.infer<typeof getWorkflowHistorySchema>,
  client: TemporalClient
): Promise<ToolResult> {
  const ns = client.ns(args.namespace);
  const endpoint = args.reverse
    ? `/api/v1/namespaces/${encodeURIComponent(ns)}/workflows/${encodeURIComponent(args.workflow_id)}/history-reverse`
    : `/api/v1/namespaces/${encodeURIComponent(ns)}/workflows/${encodeURIComponent(args.workflow_id)}/history`;

  const params: Record<string, string | number | boolean | undefined> = {
    pageSize: args.page_size ?? 50,
    nextPageToken: args.next_page_token,
  };
  if (args.run_id) params['execution.runId'] = args.run_id;

  const data = await client.get<Record<string, unknown>>(endpoint, params);

  const history = data.history as Record<string, unknown> | undefined;
  const events = (history?.events ?? data.events ?? []) as Record<string, unknown>[];

  const lines: string[] = [
    `# Workflow History: ${args.workflow_id}`,
    `${args.reverse ? '(reversed)' : ''} ${events.length} events returned`,
    '',
  ];

  for (const event of events) {
    const eventId = event.eventId ?? '?';
    const eventType = String(event.eventType ?? '');
    const time = fmtTime(event.eventTime);
    const detail = eventDetail(event);
    lines.push(`${String(eventId).padStart(4)}  ${labelEvent(eventType)}${detail}  [${time}]`);
  }

  if (data.nextPageToken) {
    lines.push('', `*Next page token: ${data.nextPageToken}*`);
  }

  return { content: [{ type: 'text', text: lines.join('\n') }] };
}
