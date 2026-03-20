import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { createClientFromEnv, TemporalError } from './client.js';
import type { ToolResult } from './types.js';

import { clusterToolDefinitions, getClusterInfoSchema, handleGetClusterInfo } from './tools/cluster.js';
import {
  namespaceToolDefinitions,
  listNamespacesSchema, describeNamespaceSchema,
  handleListNamespaces, handleDescribeNamespace,
} from './tools/namespaces.js';
import {
  workflowToolDefinitions,
  listWorkflowsSchema, describeWorkflowSchema, startWorkflowSchema,
  signalWorkflowSchema, queryWorkflowSchema, cancelWorkflowSchema, terminateWorkflowSchema,
  handleListWorkflows, handleDescribeWorkflow, handleStartWorkflow,
  handleSignalWorkflow, handleQueryWorkflow, handleCancelWorkflow, handleTerminateWorkflow,
} from './tools/workflows.js';
import {
  historyToolDefinitions,
  getWorkflowHistorySchema,
  handleGetWorkflowHistory,
} from './tools/workflow-history.js';
import {
  scheduleToolDefinitions,
  listSchedulesSchema, describeScheduleSchema, createScheduleSchema, deleteScheduleSchema,
  handleListSchedules, handleDescribeSchedule, handleCreateSchedule, handleDeleteSchedule,
} from './tools/schedules.js';
import {
  taskQueueToolDefinitions,
  describeTaskQueueSchema,
  handleDescribeTaskQueue,
} from './tools/task-queues.js';
import {
  searchAttributeToolDefinitions,
  listSearchAttributesSchema,
  handleListSearchAttributes,
} from './tools/search-attributes.js';

/** Wraps a handler call with error normalisation for MCP error content. */
async function runTool(fn: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await fn();
  } catch (err) {
    let message: string;
    if (err instanceof TemporalError) {
      message = `Temporal API error ${err.status}: ${err.message}`;
    } else if (err instanceof Error) {
      message = err.message;
    } else {
      message = String(err);
    }
    return {
      content: [{ type: 'text', text: `Error: ${message}` }],
      isError: true,
    };
  }
}

/** Parse and validate tool arguments with Zod, returning a typed error on failure. */
function parseArgs<T>(schema: z.ZodType<T>, args: unknown): { ok: true; data: T } | { ok: false; error: ToolResult } {
  const result = schema.safeParse(args);
  if (!result.success) {
    return {
      ok: false,
      error: {
        content: [{ type: 'text', text: `Invalid arguments: ${result.error.message}` }],
        isError: true,
      },
    };
  }
  return { ok: true, data: result.data };
}

async function main(): Promise<void> {
  // Validate configuration at startup — fail fast before connecting to MCP
  const client = createClientFromEnv();

  const server = new Server(
    { name: 'temporal-mcp', version: '0.1.0' },
    { capabilities: { tools: {} } }
  );

  // All tool definitions from every module
  const allToolDefs = [
    ...clusterToolDefinitions,
    ...namespaceToolDefinitions,
    ...workflowToolDefinitions,
    ...historyToolDefinitions,
    ...scheduleToolDefinitions,
    ...taskQueueToolDefinitions,
    ...searchAttributeToolDefinitions,
  ];

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: allToolDefs,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    switch (name) {
      // ── Cluster ──────────────────────────────────────────────────────────
      case 'get_cluster_info': {
        const parsed = parseArgs(getClusterInfoSchema, args);
        if (!parsed.ok) return parsed.error;
        return runTool(() => handleGetClusterInfo(parsed.data, client));
      }

      // ── Namespaces ───────────────────────────────────────────────────────
      case 'list_namespaces': {
        const parsed = parseArgs(listNamespacesSchema, args);
        if (!parsed.ok) return parsed.error;
        return runTool(() => handleListNamespaces(parsed.data, client));
      }
      case 'describe_namespace': {
        const parsed = parseArgs(describeNamespaceSchema, args);
        if (!parsed.ok) return parsed.error;
        return runTool(() => handleDescribeNamespace(parsed.data, client));
      }

      // ── Workflows ────────────────────────────────────────────────────────
      case 'list_workflows': {
        const parsed = parseArgs(listWorkflowsSchema, args);
        if (!parsed.ok) return parsed.error;
        return runTool(() => handleListWorkflows(parsed.data, client));
      }
      case 'describe_workflow': {
        const parsed = parseArgs(describeWorkflowSchema, args);
        if (!parsed.ok) return parsed.error;
        return runTool(() => handleDescribeWorkflow(parsed.data, client));
      }
      case 'start_workflow': {
        const parsed = parseArgs(startWorkflowSchema, args);
        if (!parsed.ok) return parsed.error;
        return runTool(() => handleStartWorkflow(parsed.data, client));
      }
      case 'signal_workflow': {
        const parsed = parseArgs(signalWorkflowSchema, args);
        if (!parsed.ok) return parsed.error;
        return runTool(() => handleSignalWorkflow(parsed.data, client));
      }
      case 'query_workflow': {
        const parsed = parseArgs(queryWorkflowSchema, args);
        if (!parsed.ok) return parsed.error;
        return runTool(() => handleQueryWorkflow(parsed.data, client));
      }
      case 'cancel_workflow': {
        const parsed = parseArgs(cancelWorkflowSchema, args);
        if (!parsed.ok) return parsed.error;
        return runTool(() => handleCancelWorkflow(parsed.data, client));
      }
      case 'terminate_workflow': {
        const parsed = parseArgs(terminateWorkflowSchema, args);
        if (!parsed.ok) return parsed.error;
        return runTool(() => handleTerminateWorkflow(parsed.data, client));
      }

      // ── Workflow History ─────────────────────────────────────────────────
      case 'get_workflow_history': {
        const parsed = parseArgs(getWorkflowHistorySchema, args);
        if (!parsed.ok) return parsed.error;
        return runTool(() => handleGetWorkflowHistory(parsed.data, client));
      }

      // ── Schedules ────────────────────────────────────────────────────────
      case 'list_schedules': {
        const parsed = parseArgs(listSchedulesSchema, args);
        if (!parsed.ok) return parsed.error;
        return runTool(() => handleListSchedules(parsed.data, client));
      }
      case 'describe_schedule': {
        const parsed = parseArgs(describeScheduleSchema, args);
        if (!parsed.ok) return parsed.error;
        return runTool(() => handleDescribeSchedule(parsed.data, client));
      }
      case 'create_schedule': {
        const parsed = parseArgs(createScheduleSchema, args);
        if (!parsed.ok) return parsed.error;
        return runTool(() => handleCreateSchedule(parsed.data, client));
      }
      case 'delete_schedule': {
        const parsed = parseArgs(deleteScheduleSchema, args);
        if (!parsed.ok) return parsed.error;
        return runTool(() => handleDeleteSchedule(parsed.data, client));
      }

      // ── Task Queues ──────────────────────────────────────────────────────
      case 'describe_task_queue': {
        const parsed = parseArgs(describeTaskQueueSchema, args);
        if (!parsed.ok) return parsed.error;
        return runTool(() => handleDescribeTaskQueue(parsed.data, client));
      }

      // ── Search Attributes ────────────────────────────────────────────────
      case 'list_search_attributes': {
        const parsed = parseArgs(listSearchAttributesSchema, args);
        if (!parsed.ok) return parsed.error;
        return runTool(() => handleListSearchAttributes(parsed.data, client));
      }

      default:
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // MCP servers must not write to stdout — log startup to stderr only
  process.stderr.write('Temporal MCP server started\n');
}

main().catch((err) => {
  process.stderr.write(`Fatal error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
