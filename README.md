# Temporal.io MCP Server

![Temporal MCP Banner](https://raw.githubusercontent.com/alisaitteke/temporal-mcp/refs/heads/master/temporal-mcp.jpg)

MCP server for the [Temporal](https://temporal.io) HTTP API. Manage workflows, namespaces, schedules, and more directly from Cursor, Claude Code, or any MCP-compatible IDE.

> **Disclaimer:** This is an independent, community-built MCP server and is not affiliated with, endorsed by, or officially supported by [Temporal Technologies, Inc.](https://temporal.io)

**32 tools** covering the full Temporal HTTP API surface. By default, only the 11 most essential tools are exposed to keep the LLM context lean — see [Tool tiers](#tool-tiers).

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
| `list_workflows` | List or search executions using visibility query syntax |
| `describe_workflow` | Status, type, task queue, start/close time |
| `start_workflow` | Start a new workflow execution |
| `signal_workflow` | Send a signal to a running workflow |
| `query_workflow` | Query workflow state via a registered query handler |
| `cancel_workflow` | Request graceful cancellation |
| `terminate_workflow` | Force-terminate immediately (no cleanup) |
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
| `TEMPORAL_TOOLS` | No | `essential` | Tool set to expose: `essential` (11 core tools) or `all` (32 tools) |

### Tool tiers

**`essential` (default — 11 tools)**
Covers everyday workflow development. Keeps the LLM context lean.

`get_cluster_info`, `list_namespaces`, `describe_namespace`, `list_workflows`, `describe_workflow`, `start_workflow`, `signal_workflow`, `query_workflow`, `cancel_workflow`, `terminate_workflow`, `get_workflow_history`

**`all` (32 tools)**
Adds schedules, activities, batch operations, worker deployments, Nexus endpoints, workflow rules, task queues, and search attributes.

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
