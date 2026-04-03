#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

const apiKey = process.env.SOLDY_API_KEY;
if (!apiKey) {
  console.error("Error: SOLDY_API_KEY environment variable is required.");
  console.error("Get your API key at https://soldy.ai/app/settings");
  process.exit(1);
}

const apiUrl = process.env.SOLDY_API_URL ?? "https://api.soldy.ai";

const { server, bridge } = createServer(apiUrl, apiKey);
const transport = new StdioServerTransport();

await server.connect(transport);

// Attach bridge to the low-level Server for sending notifications
bridge.setServer(server.server);

// Log to stderr (stdout is reserved for JSON-RPC)
console.error(`Soldy MCP server running (API: ${apiUrl})`);
