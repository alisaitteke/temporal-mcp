import { z } from 'zod';
import type { TemporalClient } from '../client.js';
import type { ToolResult } from '../types.js';

export const workflowRuleToolDefinitions = [
  {
    name: 'list_workflow_rules',
    description: 'List workflow rules in a namespace. Workflow rules automatically perform actions (terminate, pause, etc.) on matching workflows.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        namespace: { type: 'string', description: 'Target namespace.' },
      },
      required: [],
    },
  },
  {
    name: 'describe_workflow_rule',
    description: 'Get details of a specific workflow rule: spec, action, and status.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        namespace: { type: 'string', description: 'Namespace containing the rule.' },
        rule_id: { type: 'string', description: 'Workflow rule ID.' },
      },
      required: ['rule_id'],
    },
  },
  {
    name: 'create_workflow_rule',
    description:
      'Create a workflow rule that automatically acts on workflows matching a visibility query. Supported actions: TERMINATE, PAUSE.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        namespace: { type: 'string', description: 'Target namespace.' },
        rule_id: { type: 'string', description: 'Unique rule ID.' },
        query: {
          type: 'string',
          description: 'Visibility query to match workflows (e.g. "WorkflowType=\'OldJob\' AND ExecutionStatus=\'Running\'").',
        },
        action: {
          type: 'string',
          enum: ['TERMINATE', 'PAUSE'],
          description: 'Action to perform on matching workflows.',
        },
        description: { type: 'string', description: 'Human-readable description of the rule.' },
      },
      required: ['rule_id', 'query', 'action'],
    },
  },
  {
    name: 'delete_workflow_rule',
    description: 'Delete a workflow rule. Workflows already acted on are not affected.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        namespace: { type: 'string', description: 'Namespace containing the rule.' },
        rule_id: { type: 'string', description: 'Rule ID to delete.' },
      },
      required: ['rule_id'],
    },
  },
];

export const listWorkflowRulesSchema = z.object({
  namespace: z.string().optional(),
});

export const describeWorkflowRuleSchema = z.object({
  namespace: z.string().optional(),
  rule_id: z.string(),
});

export const createWorkflowRuleSchema = z.object({
  namespace: z.string().optional(),
  rule_id: z.string(),
  query: z.string(),
  action: z.enum(['TERMINATE', 'PAUSE']),
  description: z.string().optional(),
});

export const deleteWorkflowRuleSchema = z.object({
  namespace: z.string().optional(),
  rule_id: z.string(),
});

function formatRule(rule: Record<string, unknown>): string[] {
  const lines: string[] = [];
  const spec = rule.spec as Record<string, unknown> | undefined;
  if (rule.id) lines.push(`- ID: ${rule.id}`);
  if (spec?.visibilityQuery) lines.push(`- Query: ${spec.visibilityQuery}`);
  const action = spec?.action as Record<string, unknown> | undefined;
  if (action) {
    if (action.terminateWorkflow !== undefined) lines.push('- Action: TERMINATE');
    else if (action.pauseWorkflow !== undefined) lines.push('- Action: PAUSE');
    else lines.push(`- Action: ${JSON.stringify(action)}`);
  }
  if (spec?.description) lines.push(`- Description: ${spec.description}`);
  if (rule.createTime) lines.push(`- Created: ${rule.createTime}`);
  return lines;
}

export async function handleListWorkflowRules(
  args: z.infer<typeof listWorkflowRulesSchema>,
  client: TemporalClient
): Promise<ToolResult> {
  const ns = client.ns(args.namespace);
  const data = await client.get<Record<string, unknown>>(
    `/api/v1/namespaces/${encodeURIComponent(ns)}/workflow-rules`
  );

  const rules = (data.workflowRules as Record<string, unknown>[] | undefined) ?? [];
  const lines: string[] = [`# Workflow Rules in "${ns}" (${rules.length} found)`, ''];

  for (const rule of rules) {
    const spec = rule.spec as Record<string, unknown> | undefined;
    lines.push(`## ${rule.id ?? 'unknown'}${spec?.description ? ` — ${spec.description}` : ''}`);
    lines.push(...formatRule(rule));
    lines.push('');
  }

  if (rules.length === 0) lines.push('No workflow rules found.');
  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

export async function handleDescribeWorkflowRule(
  args: z.infer<typeof describeWorkflowRuleSchema>,
  client: TemporalClient
): Promise<ToolResult> {
  const ns = client.ns(args.namespace);
  const data = await client.get<Record<string, unknown>>(
    `/api/v1/namespaces/${encodeURIComponent(ns)}/workflow-rules/${encodeURIComponent(args.rule_id)}`
  );

  const rule = (data.workflowRule as Record<string, unknown> | undefined) ?? data;
  const spec = rule.spec as Record<string, unknown> | undefined;
  const lines: string[] = [`# Workflow Rule: ${rule.id ?? args.rule_id}${spec?.description ? ` — ${spec.description}` : ''}`, ''];
  lines.push(...formatRule(rule));

  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

export async function handleCreateWorkflowRule(
  args: z.infer<typeof createWorkflowRuleSchema>,
  client: TemporalClient
): Promise<ToolResult> {
  const ns = client.ns(args.namespace);

  const action: Record<string, unknown> =
    args.action === 'TERMINATE'
      ? { terminateWorkflow: {} }
      : { pauseWorkflow: {} };

  const body = {
    workflowRule: {
      id: args.rule_id,
      spec: {
        visibilityQuery: args.query,
        action,
        description: args.description ?? '',
      },
    },
  };

  await client.post(
    `/api/v1/namespaces/${encodeURIComponent(ns)}/workflow-rules`,
    body
  );

  return {
    content: [{
      type: 'text',
      text: `Workflow rule "${args.rule_id}" created in "${ns}". Action: ${args.action}, Query: ${args.query}`,
    }],
  };
}

export async function handleDeleteWorkflowRule(
  args: z.infer<typeof deleteWorkflowRuleSchema>,
  client: TemporalClient
): Promise<ToolResult> {
  const ns = client.ns(args.namespace);
  await client.delete(
    `/api/v1/namespaces/${encodeURIComponent(ns)}/workflow-rules/${encodeURIComponent(args.rule_id)}`
  );
  return {
    content: [{ type: 'text', text: `Workflow rule "${args.rule_id}" deleted from namespace "${ns}".` }],
  };
}
