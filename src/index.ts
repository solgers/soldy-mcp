#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";
import { resolveWebUrl } from "./web-links.js";

const apiKey = process.env.SOLDY_API_KEY;
if (!apiKey) {
  console.error("Error: SOLDY_API_KEY environment variable is required.");
  console.error("Get your API key at https://soldy.ai/app/settings");
  process.exit(1);
}

const apiUrl = process.env.SOLDY_API_URL ?? "https://api.soldy.ai";
const webUrl = resolveWebUrl(apiUrl, process.env.SOLDY_WEB_URL);

const { server } = createServer(apiUrl, apiKey, webUrl);
const transport = new StdioServerTransport();

await server.connect(transport);

// Log to stderr (stdout is reserved for JSON-RPC)
console.error(`Soldy MCP server running (API: ${apiUrl}, Web: ${webUrl})`);

// Graceful shutdown
const shutdown = () => {
  console.error("[Soldy MCP] Shutting down...");
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
