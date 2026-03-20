#!/usr/bin/env node
import('../dist/index.js').catch((err) => {
  console.error('Failed to start Temporal MCP Server:', err);
  process.exit(1);
});
