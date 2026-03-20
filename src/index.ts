import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { createClientFromEnv, TemporalError } from './client.js';
import type { ToolResult } from './types.js';

// ── Phase 1 ──────────────────────────────────────────────────────────────────
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

// ── Phase 2 ──────────────────────────────────────────────────────────────────
import {
  activityToolDefinitions,
  listActivitiesSchema, describeActivitySchema,
  handleListActivities, handleDescribeActivity,
} from './tools/activities.js';
import {
  batchOperationToolDefinitions,
  listBatchOperationsSchema, describeBatchOperationSchema, stopBatchOperationSchema,
  handleListBatchOperations, handleDescribeBatchOperation, handleStopBatchOperation,
} from './tools/batch-operations.js';
import {
  workerDeploymentToolDefinitions,
  listWorkerDeploymentsSchema, describeWorkerDeploymentSchema,
  handleListWorkerDeployments, handleDescribeWorkerDeployment,
} from './tools/worker-deployments.js';
import {
  nexusEndpointToolDefinitions,
  listNexusEndpointsSchema, getNexusEndpointSchema, createNexusEndpointSchema, deleteNexusEndpointSchema,
  handleListNexusEndpoints, handleGetNexusEndpoint, handleCreateNexusEndpoint, handleDeleteNexusEndpoint,
} from './tools/nexus-endpoints.js';
import {
  workflowRuleToolDefinitions,
  listWorkflowRulesSchema, describeWorkflowRuleSchema, createWorkflowRuleSchema, deleteWorkflowRuleSchema,
  handleListWorkflowRules, handleDescribeWorkflowRule, handleCreateWorkflowRule, handleDeleteWorkflowRule,
} from './tools/workflow-rules.js';

// ─── Tool tier filtering ──────────────────────────────────────────────────────

/**
 * Core tools for everyday workflow development.
 * Loaded when TEMPORAL_TOOLS=essential (the default).
 * Keeps the LLM context lean — use TEMPORAL_TOOLS=all to expose every tool.
 */
const ESSENTIAL_TOOLS = new Set([
  'get_cluster_info',
  'list_namespaces',
  'describe_namespace',
  'list_workflows',
  'describe_workflow',
  'start_workflow',
  'signal_workflow',
  'query_workflow',
  'cancel_workflow',
  'terminate_workflow',
  'get_workflow_history',
]);

function resolveToolTier(): 'essential' | 'all' {
  const val = (process.env.TEMPORAL_TOOLS ?? 'essential').toLowerCase();
  return val === 'all' ? 'all' : 'essential';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Server ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Validate configuration at startup — fail fast before connecting to MCP
  const client = createClientFromEnv();

  const server = new Server(
    { name: 'temporal-mcp', version: '0.1.0' },
    { capabilities: { tools: {} } }
  );

  const tier = resolveToolTier();
  const allToolDefs = [
    // Phase 1
    ...clusterToolDefinitions,
    ...namespaceToolDefinitions,
    ...workflowToolDefinitions,
    ...historyToolDefinitions,
    ...scheduleToolDefinitions,
    ...taskQueueToolDefinitions,
    ...searchAttributeToolDefinitions,
    // Phase 2
    ...activityToolDefinitions,
    ...batchOperationToolDefinitions,
    ...workerDeploymentToolDefinitions,
    ...nexusEndpointToolDefinitions,
    ...workflowRuleToolDefinitions,
  ];

  const tools = tier === 'all'
    ? allToolDefs
    : allToolDefs.filter((t) => ESSENTIAL_TOOLS.has(t.name));

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

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

      // ── Activities ───────────────────────────────────────────────────────
      case 'list_activities': {
        const parsed = parseArgs(listActivitiesSchema, args);
        if (!parsed.ok) return parsed.error;
        return runTool(() => handleListActivities(parsed.data, client));
      }
      case 'describe_activity': {
        const parsed = parseArgs(describeActivitySchema, args);
        if (!parsed.ok) return parsed.error;
        return runTool(() => handleDescribeActivity(parsed.data, client));
      }

      // ── Batch Operations ─────────────────────────────────────────────────
      case 'list_batch_operations': {
        const parsed = parseArgs(listBatchOperationsSchema, args);
        if (!parsed.ok) return parsed.error;
        return runTool(() => handleListBatchOperations(parsed.data, client));
      }
      case 'describe_batch_operation': {
        const parsed = parseArgs(describeBatchOperationSchema, args);
        if (!parsed.ok) return parsed.error;
        return runTool(() => handleDescribeBatchOperation(parsed.data, client));
      }
      case 'stop_batch_operation': {
        const parsed = parseArgs(stopBatchOperationSchema, args);
        if (!parsed.ok) return parsed.error;
        return runTool(() => handleStopBatchOperation(parsed.data, client));
      }

      // ── Worker Deployments ───────────────────────────────────────────────
      case 'list_worker_deployments': {
        const parsed = parseArgs(listWorkerDeploymentsSchema, args);
        if (!parsed.ok) return parsed.error;
        return runTool(() => handleListWorkerDeployments(parsed.data, client));
      }
      case 'describe_worker_deployment': {
        const parsed = parseArgs(describeWorkerDeploymentSchema, args);
        if (!parsed.ok) return parsed.error;
        return runTool(() => handleDescribeWorkerDeployment(parsed.data, client));
      }

      // ── Nexus Endpoints ──────────────────────────────────────────────────
      case 'list_nexus_endpoints': {
        const parsed = parseArgs(listNexusEndpointsSchema, args);
        if (!parsed.ok) return parsed.error;
        return runTool(() => handleListNexusEndpoints(parsed.data, client));
      }
      case 'get_nexus_endpoint': {
        const parsed = parseArgs(getNexusEndpointSchema, args);
        if (!parsed.ok) return parsed.error;
        return runTool(() => handleGetNexusEndpoint(parsed.data, client));
      }
      case 'create_nexus_endpoint': {
        const parsed = parseArgs(createNexusEndpointSchema, args);
        if (!parsed.ok) return parsed.error;
        return runTool(() => handleCreateNexusEndpoint(parsed.data, client));
      }
      case 'delete_nexus_endpoint': {
        const parsed = parseArgs(deleteNexusEndpointSchema, args);
        if (!parsed.ok) return parsed.error;
        return runTool(() => handleDeleteNexusEndpoint(parsed.data, client));
      }

      // ── Workflow Rules ───────────────────────────────────────────────────
      case 'list_workflow_rules': {
        const parsed = parseArgs(listWorkflowRulesSchema, args);
        if (!parsed.ok) return parsed.error;
        return runTool(() => handleListWorkflowRules(parsed.data, client));
      }
      case 'describe_workflow_rule': {
        const parsed = parseArgs(describeWorkflowRuleSchema, args);
        if (!parsed.ok) return parsed.error;
        return runTool(() => handleDescribeWorkflowRule(parsed.data, client));
      }
      case 'create_workflow_rule': {
        const parsed = parseArgs(createWorkflowRuleSchema, args);
        if (!parsed.ok) return parsed.error;
        return runTool(() => handleCreateWorkflowRule(parsed.data, client));
      }
      case 'delete_workflow_rule': {
        const parsed = parseArgs(deleteWorkflowRuleSchema, args);
        if (!parsed.ok) return parsed.error;
        return runTool(() => handleDeleteWorkflowRule(parsed.data, client));
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

  process.stderr.write(`Temporal MCP server started (tools: ${tier}, ${tools.length} loaded)\n`);
}

main().catch((err) => {
  process.stderr.write(`Fatal error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
