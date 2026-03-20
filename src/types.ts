/** Temporal server configuration read from environment variables. */
export interface TemporalConfig {
  address: string;
  defaultNamespace: string;
  apiKey?: string;
}

/** Generic paginated response envelope. */
export interface PaginatedResponse<T> {
  items: T[];
  nextPageToken?: string;
}

/** Temporal workflow execution status codes. */
export type WorkflowStatus =
  | 'Running'
  | 'Completed'
  | 'Failed'
  | 'Cancelled'
  | 'Terminated'
  | 'ContinuedAsNew'
  | 'TimedOut'
  | 'Unknown';

export interface WorkflowExecution {
  workflowId: string;
  runId?: string;
}

export interface WorkflowExecutionInfo {
  execution: WorkflowExecution;
  type: { name: string };
  startTime?: string;
  closeTime?: string;
  status: WorkflowStatus;
  historyLength?: string;
  taskQueue?: string;
  memo?: Record<string, unknown>;
  searchAttributes?: Record<string, unknown>;
}

export interface NamespaceInfo {
  name: string;
  state: string;
  description?: string;
  ownerEmail?: string;
  workflowExecutionRetentionPeriod?: string;
  activeClusterName?: string;
}

export interface ScheduleInfo {
  scheduleId: string;
  state?: {
    paused: boolean;
    notes?: string;
  };
  recentActions?: unknown[];
  futureActionTimes?: string[];
}

export interface TaskQueueInfo {
  taskQueue: string;
  taskQueueType: string;
  pollers?: unknown[];
}

export interface SearchAttributeInfo {
  customAttributes: Record<string, string>;
  systemAttributes?: Record<string, string>;
}

/** Temporal API error shape. */
export interface TemporalApiError {
  code: number;
  message: string;
  details?: unknown[];
}

/** Standard MCP tool result — re-exported from the SDK for convenience. */
export type { CallToolResult as ToolResult } from '@modelcontextprotocol/sdk/types.js';
