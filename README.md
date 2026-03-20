# Temporal.io MCP Server

![Temporal MCP Banner](https://raw.githubusercontent.com/alisaitteke/temporal-mcp/refs/heads/master/temporal-mcp.jpg)

MCP server for the [Temporal](https://temporal.io) HTTP API. Manage workflows, namespaces, schedules, and more directly from Cursor, Claude Code, or any MCP-compatible IDE.

> **Disclaimer:** This is an independent, community-built MCP server and is not affiliated with, endorsed by, or officially supported by [Temporal Technologies, Inc.](https://temporal.io)

**36 tools** covering the full Temporal HTTP API surface. By default, only the 11 most essential tools are exposed to keep the LLM context lean — see [Tool tiers](#tool-tiers).

## Tools

### Cluster
| Tool | What it does |
|---|---|
| `get_cluster_info` | Server version, cluster ID, and enabled capabilities |

### Namespaces
| Tool | What it does |
|---|---|
| `list_namespaces` | List all namespaces in the cluster |
| `describe_namespace` | Config, retention period, replication info |

### Workflows
| Tool | What it does |
|---|---|
| `count_workflows` | Count executions matching a visibility query |
| `list_workflows` | List or search executions using visibility query syntax |
| `describe_workflow` | Status, type, task queue, start/close time |
| `start_workflow` | Start a new workflow execution |
| `signal_workflow` | Send a signal to a running workflow |
| `signal_with_start_workflow` | Start + signal in one atomic call (or signal if already running) |
| `query_workflow` | Query workflow state via a registered query handler |
| `cancel_workflow` | Request graceful cancellation |
| `terminate_workflow` | Force-terminate immediately (no cleanup) |
| `pause_workflow` | Pause execution (stops scheduling new tasks) |
| `unpause_workflow` | Resume a paused workflow |
| `get_workflow_history` | Event history with human-readable summaries |

### Schedules
| Tool | What it does |
|---|---|
| `list_schedules` | List all schedules in a namespace |
| `describe_schedule` | Spec, state, recent actions, next run times |
| `create_schedule` | Create a cron or interval-based schedule |
| `delete_schedule` | Delete a schedule |

### Activities
| Tool | What it does |
|---|---|
| `list_activities` | List activity executions (filter by workflow, type, status) |
| `describe_activity` | State, attempt count, heartbeat, failure details |

### Batch Operations
| Tool | What it does |
|---|---|
| `list_batch_operations` | List bulk signal/cancel/terminate jobs |
| `describe_batch_operation` | Progress, state, success/failure counts |
| `stop_batch_operation` | Stop a running batch job |

### Worker Deployments
| Tool | What it does |
|---|---|
| `list_worker_deployments` | List all versioned worker deployments |
| `describe_worker_deployment` | Current/ramping version, version history |

### Nexus Endpoints
| Tool | What it does |
|---|---|
| `list_nexus_endpoints` | List all Nexus endpoints in the cluster |
| `get_nexus_endpoint` | Endpoint target namespace and task queue |
| `create_nexus_endpoint` | Register a new Nexus endpoint |
| `delete_nexus_endpoint` | Remove a Nexus endpoint |

### Workflow Rules
| Tool | What it does |
|---|---|
| `list_workflow_rules` | List auto-action rules for matching workflows |
| `describe_workflow_rule` | Rule query, action, and creation time |
| `create_workflow_rule` | Create a TERMINATE or PAUSE rule with a visibility query |
| `delete_workflow_rule` | Delete a rule |

### Task Queues & Search Attributes
| Tool | What it does |
|---|---|
| `describe_task_queue` | Active pollers, task ID block |
| `list_search_attributes` | Custom and system search attributes |

## Requirements

- Node.js >= 18
- A running Temporal server (local or remote)

## Add to Cursor

Open or create `.cursor/mcp.json` in your project root (or `~/.cursor/mcp.json` for global):

```json
{
  "mcpServers": {
    "temporal": {
      "command": "npx",
      "args": ["-y", "@alisaitteke/temporal-mcp"],
      "env": {
        "TEMPORAL_ADDRESS": "http://localhost:8080",
        "TEMPORAL_NAMESPACE": "default",
        "TEMPORAL_TOOLS": "essential"
      }
    }
  }
}
```

Restart Cursor. The Temporal tools will appear in the MCP tool list.

## Add to Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "temporal": {
      "command": "npx",
      "args": ["-y", "@alisaitteke/temporal-mcp"],
      "env": {
        "TEMPORAL_ADDRESS": "http://localhost:8080",
        "TEMPORAL_NAMESPACE": "default",
        "TEMPORAL_TOOLS": "essential"
      }
    }
  }
}
```

Restart Claude Desktop.

## Add to Claude Code

```bash
claude mcp add temporal \
  --command "npx" \
  --args "-y,@alisaitteke/temporal-mcp" \
  --env "TEMPORAL_ADDRESS=http://localhost:8080" \
  --env "TEMPORAL_NAMESPACE=default" \
  --env "TEMPORAL_TOOLS=essential"
```

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `TEMPORAL_ADDRESS` | Yes | — | Temporal server base URL |
| `TEMPORAL_NAMESPACE` | No | `default` | Default namespace for all tools |
| `TEMPORAL_API_KEY` | No | — | Bearer token for authenticated clusters |
| `TEMPORAL_TOOLS` | No | `essential` | Tool set: `essential`, `standard`, or `all` |

### Tool tiers

| `TEMPORAL_TOOLS` | # | Role |
|---|---:|---|
| `essential` | 11 | **Default.** Cluster + namespaces + everyday workflow run/debug (list, describe, start, signal, query, cancel, terminate, history). Smallest tool list for the LLM. |
| `standard` | 23 | **essential** plus counts, pause/unpause, signal-with-start, schedules, activities, task queue description, and search attributes. |
| `all` | 36 | **standard** plus batch operations, worker deployments, Nexus endpoints, and workflow rules. |

| Set | Tools |
|---|---|
| `essential` only (11) | `get_cluster_info`, `list_namespaces`, `describe_namespace`, `list_workflows`, `describe_workflow`, `start_workflow`, `signal_workflow`, `query_workflow`, `cancel_workflow`, `terminate_workflow`, `get_workflow_history` |
| Also enabled with `standard` (+12, 23 total with essential) | `count_workflows`, `pause_workflow`, `unpause_workflow`, `signal_with_start_workflow`, `list_schedules`, `describe_schedule`, `create_schedule`, `delete_schedule`, `list_activities`, `describe_activity`, `describe_task_queue`, `list_search_attributes` |
| Also enabled with `all` (+13, 36 total with standard) | `list_batch_operations`, `describe_batch_operation`, `stop_batch_operation`, `list_worker_deployments`, `describe_worker_deployment`, `list_nexus_endpoints`, `get_nexus_endpoint`, `create_nexus_endpoint`, `delete_nexus_endpoint`, `list_workflow_rules`, `describe_workflow_rule`, `create_workflow_rule`, `delete_workflow_rule` |

## Structured Output

Key tools return both a human-readable text summary and a machine-readable `structuredContent` JSON object. Clients that support MCP structured output (e.g. Claude) can use the structured data for further processing without parsing text.

Tools with structured output: `get_cluster_info`, `list_namespaces`, `list_workflows`, `describe_workflow`, `count_workflows`, `list_schedules`, `list_activities`.

## Local Development

```bash
git clone https://github.com/alisaitteke/temporal-mcp
cd temporal-mcp
npm install
npm run build
```

Use local path instead of npx:

```json
{
  "mcpServers": {
    "temporal": {
      "command": "node",
      "args": ["/path/to/temporal-mcp/bin/temporal-mcp.js"],
      "env": {
        "TEMPORAL_ADDRESS": "http://localhost:8080"
      }
    }
  }
}
```

## License

MIT

## Contributors

<table>
  <tr>
    <td align="center">
      <a href="https://github.com/alisaitteke">
        <img src="https://github.com/alisaitteke.png" width="100px;" alt="Ali Sait Teke"/>
        <br />
        <sub><b>Ali Sait Teke</b></sub>
      </a>
      <br />
      <sub>Creator & Maintainer</sub>
    </td>
  </tr>
</table>

Thanks to everyone who helps improve this project!

[![Contributors](https://img.shields.io/github/contributors/alisaitteke/temporal-mcp?style=flat-square)](https://github.com/alisaitteke/temporal-mcp/graphs/contributors)
