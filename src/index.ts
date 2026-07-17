#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  clearStoredApiKey,
  loadStoredApiKey,
  loginViaBrowser,
} from "./auth.js";
import { createServer } from "./server.js";
import { resolveWebUrl } from "./web-links.js";

const apiUrl = process.env.SOLDY_API_URL ?? "https://api.soldy.ai";
const webUrl = resolveWebUrl(apiUrl, process.env.SOLDY_WEB_URL);

/**
 * Credential resolution, in priority order:
 *   1. SOLDY_API_KEY env var (explicit config always wins)
 *   2. ~/.soldy/credentials.json (persisted by a previous browser login)
 *   3. Browser login — opens the Soldy web app, which mints an API key with
 *      the user's web session and posts it back to a localhost callback.
 *
 * The login promise is created lazily and shared, so the browser opens at
 * most once per process, and the MCP handshake completes immediately —
 * only tool calls wait for the key.
 */
const envApiKey = process.env.SOLDY_API_KEY;
let pendingLogin: Promise<string> | null = null;
let resolvedApiKey: string | null = envApiKey ?? null;

async function getApiKey(): Promise<string> {
  if (resolvedApiKey) return resolvedApiKey;

  const stored = await loadStoredApiKey(apiUrl);
  if (stored) {
    resolvedApiKey = stored;
    return stored;
  }

  if (!pendingLogin) {
    pendingLogin = loginViaBrowser(apiUrl, webUrl)
      .then((key) => {
        resolvedApiKey = key;
        return key;
      })
      .finally(() => {
        // Allow a retry (new browser tab) on the next tool call if this
        // attempt failed; on success resolvedApiKey short-circuits anyway.
        pendingLogin = null;
      });
  }
  return pendingLogin;
}

/** A 401 means the key was revoked — drop it so the next call re-logs-in. */
async function onUnauthorized(): Promise<void> {
  if (envApiKey) return; // explicit config: never silently discard
  resolvedApiKey = null;
  await clearStoredApiKey(apiUrl);
}

const { server } = createServer(apiUrl, getApiKey, webUrl, onUnauthorized);
const transport = new StdioServerTransport();

await server.connect(transport);

// Log to stderr (stdout is reserved for JSON-RPC)
console.error(`Soldy MCP server running (API: ${apiUrl}, Web: ${webUrl})`);

// Warm up credentials in the background so the browser login (if needed)
// starts as soon as the server does, not on the first tool call.
getApiKey().catch((err: unknown) => {
  console.error(`[Soldy MCP] Login not completed yet: ${String(err)}`);
});

// Graceful shutdown
const shutdown = () => {
  console.error("[Soldy MCP] Shutting down...");
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
// A pending login's loopback server would otherwise keep the process alive
// after the MCP client disconnects (stdin EOF used to be enough to exit).
process.stdin.on("close", shutdown);
