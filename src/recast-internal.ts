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
    description:
      "Queue a Higgsfield showcase feed scan. Use only the all category for latest. Each category may appear once.",
    inputSchema: z
      .object({
        evaluation: z
          .object({
            workspace_id: recordID,
            max_credits: id,
            request_key: z.uuid(),
          })
          .optional(),
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
          .max(7)
          .refine(
            (categories) => new Set(categories).size === categories.length,
            "Categories must be unique",
          ),
        min_likes: z.number().int().nonnegative(),
        min_recreates: z.number().int().nonnegative(),
        max_pages: z.number().int().positive().max(2000),
      })
      .refine(
        (p) =>
          p.sort !== "latest" ||
          (p.categories.length === 1 && p.categories[0] === "all"),
        {
          path: ["categories"],
          message: "Latest scans require exactly the all category",
        },
      ),
  },
  async (p) => output(await call(p.evaluation ? "workflows" : "syncs", p)),
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
server.registerTool(
  "get_batch_progress",
  {
    description:
      "Read import counts and paginated candidates with review and evaluation status for this scan.",
    inputSchema: { run_id: z.uuid(), page: id.default(1) },
  },
  async ({ run_id, page }) =>
    output(await call(`syncs/${run_id}/progress?page=${page}`)),
);
server.registerTool(
  "quote_evaluation",
  {
    inputSchema: { candidate_id: id },
  },
  async ({ candidate_id }) =>
    output(await call(`candidates/${candidate_id}/quote`)),
);
server.registerTool(
  "publish_evaluation_result",
  {
    description:
      "Publish the explicitly selected successful task in the connected environment.",
    inputSchema: {
      id,
      task_id: recordID,
      catalog_type: z.enum(["explore", "trending"]),
    },
  },
  async ({ id, task_id, catalog_type }) =>
    output(
      await call(`evaluations/${id}/results/${task_id}/publish`, {
        catalog_type,
      }),
    ),
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
    description: "Submit three billable tasks for an approved candidate.",
    inputSchema: {
      candidate_id: id,
      workspace_id: recordID,
      max_credits: id.optional(),
      request_key: requestKey,
    },
  },
  async (p) =>
    output(await call(p.max_credits ? "evaluations/capped" : "evaluations", p)),
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
