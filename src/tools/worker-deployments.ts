import { z } from 'zod';
import type { TemporalClient } from '../client.js';
import type { ToolResult } from '../types.js';

export const workerDeploymentToolDefinitions = [
  {
    name: 'list_worker_deployments',
    description: 'List worker deployments in a namespace. Worker deployments track versioned worker releases.',
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
    name: 'describe_worker_deployment',
    description: 'Get details of a worker deployment: current version, ramping version, routing config, and version summaries.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        namespace: { type: 'string', description: 'Namespace containing the deployment.' },
        deployment_name: { type: 'string', description: 'Deployment name.' },
      },
      required: ['deployment_name'],
    },
  },
];

export const listWorkerDeploymentsSchema = z.object({
  namespace: z.string().optional(),
  page_size: z.number().optional(),
  next_page_token: z.string().optional(),
});

export const describeWorkerDeploymentSchema = z.object({
  namespace: z.string().optional(),
  deployment_name: z.string(),
});

export async function handleListWorkerDeployments(
  args: z.infer<typeof listWorkerDeploymentsSchema>,
  client: TemporalClient
): Promise<ToolResult> {
  const ns = client.ns(args.namespace);
  const data = await client.get<Record<string, unknown>>(
    `/api/v1/namespaces/${encodeURIComponent(ns)}/worker-deployments`,
    { pageSize: args.page_size ?? 20, nextPageToken: args.next_page_token }
  );

  const deployments = (data.deployments as Record<string, unknown>[] | undefined) ?? [];
  const lines: string[] = [`# Worker Deployments in "${ns}" (${deployments.length} returned)`, ''];

  for (const dep of deployments) {
    const info = dep.deploymentInfo as Record<string, unknown> | undefined;
    const name = (info?.name ?? dep.name) as string | undefined;
    lines.push(`## ${name ?? 'unknown'}`);
    if (info?.createTime) lines.push(`- Created: ${info.createTime}`);
    const currentVersion = info?.currentVersion as Record<string, unknown> | undefined;
    if (currentVersion?.version) lines.push(`- Current Version: ${currentVersion.version}`);
    const rampingVersion = info?.rampingVersion as Record<string, unknown> | undefined;
    if (rampingVersion?.version) lines.push(`- Ramping Version: ${rampingVersion.version}`);
    lines.push('');
  }

  if (data.nextPageToken) lines.push(`*Next page token: ${data.nextPageToken}*`);
  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

export async function handleDescribeWorkerDeployment(
  args: z.infer<typeof describeWorkerDeploymentSchema>,
  client: TemporalClient
): Promise<ToolResult> {
  const ns = client.ns(args.namespace);
  const data = await client.get<Record<string, unknown>>(
    `/api/v1/namespaces/${encodeURIComponent(ns)}/worker-deployments/${encodeURIComponent(args.deployment_name)}`
  );

  const dep = data.deploymentInfo as Record<string, unknown> | undefined;
  const lines: string[] = [`# Worker Deployment: ${args.deployment_name}`, ''];

  if (dep?.createTime) lines.push(`- Created: ${dep.createTime}`);
  if (dep?.lastModifierIdentity) lines.push(`- Last Modified By: ${dep.lastModifierIdentity}`);

  const currentVersion = dep?.currentVersion as Record<string, unknown> | undefined;
  if (currentVersion) {
    lines.push('', '## Current Version');
    if (currentVersion.version) lines.push(`- Version: ${currentVersion.version}`);
    if (currentVersion.becameCurrentTime) lines.push(`- Became Current: ${currentVersion.becameCurrentTime}`);
  }

  const rampingVersion = dep?.rampingVersion as Record<string, unknown> | undefined;
  if (rampingVersion) {
    lines.push('', '## Ramping Version');
    if (rampingVersion.version) lines.push(`- Version: ${rampingVersion.version}`);
    if (rampingVersion.rampPercentage !== undefined) lines.push(`- Ramp: ${rampingVersion.rampPercentage}%`);
  }

  const versionSummaries = dep?.versionSummaries as Record<string, unknown>[] | undefined;
  if (versionSummaries?.length) {
    lines.push('', `## Version History (${versionSummaries.length})`);
    for (const v of versionSummaries) {
      lines.push(`- ${v.version}: drained=${v.drainageStatus ?? 'N/A'}`);
    }
  }

  return { content: [{ type: 'text', text: lines.join('\n') }] };
}
