#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { api, output, recordID, requestKey } from "./recast-http.js";

const server = new McpServer({ name: "soldy-recast", version: "1.0.0" });
const call = api("public");
const published = z
  .object({
    source: z.literal("system"),
    publish_status: z.literal("published"),
    status: z.literal("ready"),
  })
  .passthrough();
async function getTemplate(id: string) {
  return published.parse((await call(`templates/${id}`)).data);
}
server.registerTool(
  "list_templates",
  { inputSchema: { page: z.number().int().positive().default(1) } },
  async (p) =>
    output(await call(`templates?source=system&status=ready&page=${p.page}`)),
);
server.registerTool(
  "get_template",
  { inputSchema: { template_id: recordID } },
  async (p) => output(await getTemplate(p.template_id)),
);
server.registerTool(
  "create_recast_task",
  {
    description:
      "Start one billable generation using a published template. Reuse the request key on retries.",
    inputSchema: {
      workspace_id: recordID,
      template_id: recordID,
      request_key: requestKey,
      prompt: z.string().max(4000).optional(),
      product_id: recordID.optional(),
      avatar_id: recordID.optional(),
    },
  },
  async (p) => output(await call("template-tasks", p, p.request_key)),
);
server.registerTool(
  "get_recast_task",
  { inputSchema: { task_id: recordID } },
  async (p) => {
    const task = z
      .object({
        id: recordID,
        project_id: recordID,
        status: z.string(),
        current_stage: z.string(),
        charged_cost: z.number(),
        failure_reason: z.string().optional(),
        result_url: z.string().optional(),
        cover_url: z.string().optional(),
      })
      .parse((await call(`tasks/${p.task_id}`)).data);
    const web = new URL(process.env.SOLDY_WEB_URL || "https://soldy.ai");
    return output({
      ...task,
      share_url:
        task.status === "succeeded"
          ? new URL(`/app/share/recast-studio/${task.id}`, web.origin).href
          : undefined,
    });
  },
);
await server.connect(new StdioServerTransport());
