#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { api, output, recordID, requestKey } from "./recast-http.js";

const server = new McpServer({
  name: "soldy-recast-internal",
  version: "1.0.0",
});
const call = api("admin"),
  id = z.number().int().positive();
server.registerTool(
  "sync_showcases",
  {
    description: "Queue a Higgsfield showcase feed scan.",
    inputSchema: {
      sort: z.enum(["latest", "trending"]),
      categories: z
        .array(
          z.enum([
            "all",
            "lifestyle",
            "fun",
            "pets",
            "music videos",
            "with friends",
            "sports",
          ]),
        )
        .min(1)
        .max(7),
      min_likes: z.number().int().nonnegative(),
      min_recreates: z.number().int().nonnegative(),
      max_pages: z.number().int().positive().max(2000),
    },
  },
  async (p) => output(await call("syncs", p)),
);
server.registerTool(
  "get_sync",
  { inputSchema: { run_id: z.uuid() } },
  async (p) => output(await call(`syncs/${p.run_id}`)),
);
server.registerTool(
  "import_link",
  { inputSchema: { url: z.url().max(2048), request_key: requestKey } },
  async (p) => output(await call("imports", p)),
);
server.registerTool("get_import", { inputSchema: { id } }, async (p) =>
  output(await call(`imports/${p.id}`)),
);
server.registerTool(
  "list_candidates",
  {
    inputSchema: {
      status: z.enum(["pending", "approved", "rejected"]),
      page: id,
    },
  },
  async (p) =>
    output(await call(`candidates?status=${p.status}&page=${p.page}`)),
);
server.registerTool("get_candidate", { inputSchema: { id } }, async (p) =>
  output(await call(`candidates/${p.id}`)),
);
server.registerTool(
  "list_evaluation_workspaces",
  { inputSchema: {} },
  async () => output(await call("evaluation-workspaces")),
);
server.registerTool(
  "start_evaluation",
  {
    description: "Submit five billable tasks for an approved candidate.",
    inputSchema: {
      candidate_id: id,
      workspace_id: recordID,
      request_key: requestKey,
    },
  },
  async (p) => output(await call("evaluations", p)),
);
server.registerTool("get_report", { inputSchema: { id } }, async (p) =>
  output(await call(`evaluations/${p.id}`)),
);
server.registerTool(
  "retry_evaluation_item",
  {
    description: "Retry one failed slot. A new generation may incur credits.",
    inputSchema: { id, slot: z.number().int().min(1).max(5) },
  },
  async (p) =>
    output(await call(`evaluations/${p.id}/items/${p.slot}/retry`, {})),
);
await server.connect(new StdioServerTransport());
