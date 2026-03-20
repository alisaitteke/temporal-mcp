import { z } from 'zod';
import type { TemporalClient } from '../client.js';
import type { ToolResult } from '../types.js';

export const clusterToolDefinitions = [
  {
    name: 'get_cluster_info',
    description:
      'Get Temporal cluster information including server version, supported features, and system info. Use this first to verify connectivity and check what capabilities are available.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
];

export const getClusterInfoSchema = z.object({});

export async function handleGetClusterInfo(
  _args: z.infer<typeof getClusterInfoSchema>,
  client: TemporalClient
): Promise<ToolResult> {
  const [clusterInfo, systemInfo] = await Promise.all([
    client.get<Record<string, unknown>>('/api/v1/cluster-info'),
    client.get<Record<string, unknown>>('/api/v1/system-info'),
  ]);

  const lines: string[] = [
    '# Temporal Cluster Info',
    '',
    '## Cluster',
  ];

  if (clusterInfo.clusterId) lines.push(`- Cluster ID: ${clusterInfo.clusterId}`);
  if (clusterInfo.serverVersion) lines.push(`- Server Version: ${clusterInfo.serverVersion}`);
  if (clusterInfo.clusterName) lines.push(`- Cluster Name: ${clusterInfo.clusterName}`);
  if (clusterInfo.historyShardCount) lines.push(`- History Shard Count: ${clusterInfo.historyShardCount}`);

  lines.push('', '## System');
  const caps = systemInfo.capabilities as Record<string, unknown> | undefined;
  if (caps) {
    const enabledCaps = Object.entries(caps)
      .filter(([, v]) => v === true)
      .map(([k]) => k);
    if (enabledCaps.length > 0) {
      lines.push('Enabled capabilities:');
      enabledCaps.forEach((c) => lines.push(`  - ${c}`));
    }
  }
  if (systemInfo.serverVersion) lines.push(`- Server Version: ${systemInfo.serverVersion}`);

  return { content: [{ type: 'text', text: lines.join('\n') }] };
}
