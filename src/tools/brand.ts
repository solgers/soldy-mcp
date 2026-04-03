import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SoldyAPIClient } from "../client.js";
import { formatApiError } from "../errors.js";

interface Brand {
  id: string;
  name: string;
  description: string;
  stage: string;
}

interface BrandTask {
  id: string;
  status: string;
  progress: number;
  brand_id: string;
  reason: string;
}

export function registerBrandTools(server: McpServer, client: SoldyAPIClient) {
  server.tool(
    "create_brand",
    "Create a brand. Use before create_project if user has brand identity to associate.",
    {
      name: z.string(),
      description: z.string().optional(),
      stage: z.string().optional(),
    },
    async ({ name, description, stage }) => {
      const wsId = await client.getDefaultWorkspaceId();
      const resp = await client.post<Brand>("/public/brand", {
        name,
        slug: name
          .toLowerCase()
          .replace(/\s+/g, "-")
          .replace(/[^a-z0-9-]/g, ""),
        description: description ?? "",
        stage: stage ?? "",
        workspace_id: wsId,
      });
      if (resp.code !== 0 || !resp.data)
        return {
          content: [{ type: "text" as const, text: formatApiError(resp) }],
          isError: true,
        };

      const b = resp.data;
      return {
        content: [
          {
            type: "text" as const,
            text: `Brand created: **${b.name}** (ID: \`${b.id}\`)\nView: https://soldy.ai/app/brands/${b.id}`,
          },
        ],
      };
    },
  );

  server.tool(
    "list_brands",
    "List all brands. Check here first if user mentions a brand or company.",
    {},
    async () => {
      const wsId = await client.getDefaultWorkspaceId();
      const resp = await client.get<Brand[]>("/public/brand/list", {
        workspace_id: wsId,
      });
      if (resp.code !== 0)
        return {
          content: [{ type: "text" as const, text: formatApiError(resp) }],
          isError: true,
        };

      const brands = resp.data ?? [];
      if (brands.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No brands yet. Use create_brand or extract_brand to add one.",
            },
          ],
        };
      }

      const lines = ["| Name | ID | Stage |", "|---|---|---|"];
      for (const b of brands) {
        lines.push(`| ${b.name} | \`${b.id}\` | ${b.stage} |`);
      }
      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    },
  );

  server.tool(
    "extract_brand",
    `Extract brand identity from a product URL or website URL. This is IMPORTANT — when the user provides a product page URL, call this BEFORE create_project to give the agent brand context (colors, tone, positioning).

Returns a task_id. Use watch_brand_task(task_id) to subscribe for completion notifications (preferred), or poll get_brand_task_result. Usually takes 30-60s. Once finished, use the returned brand_id in send_message options.`,
    {
      content: z
        .string()
        .describe(
          "Product page URL, brand website URL, or text describing the brand",
        ),
      brand_id: z.string().optional(),
    },
    async ({ content, brand_id }) => {
      const wsId = await client.getDefaultWorkspaceId();
      const resp = await client.post<BrandTask>("/public/brand/task", {
        content,
        brand_id: brand_id ?? "",
        workspace_id: wsId,
      });
      if (resp.code !== 0 || !resp.data)
        return {
          content: [{ type: "text" as const, text: formatApiError(resp) }],
          isError: true,
        };

      return {
        content: [
          {
            type: "text" as const,
            text: `Brand extraction started (task: \`${resp.data.id}\`). Use watch_brand_task to subscribe for completion, or poll with get_brand_task_result. Usually takes 30-60s.`,
          },
        ],
      };
    },
  );

  server.tool(
    "get_brand_task_result",
    "Check brand extraction progress and result. For real-time updates, prefer watch_brand_task(task_id) instead of polling this tool. You can also read the resource URI soldy://brand/task/{task_id}.",
    { task_id: z.string() },
    async ({ task_id }) => {
      const wsId = await client.getDefaultWorkspaceId();
      const resp = await client.post<BrandTask[]>("/public/brand/task/result", {
        task_ids: [task_id],
        workspace_id: wsId,
      });
      if (resp.code !== 0 || !resp.data || resp.data.length === 0) {
        return {
          content: [{ type: "text" as const, text: "Task not found." }],
          isError: true,
        };
      }

      const task = resp.data[0];
      switch (task.status) {
        case "running":
          return {
            content: [
              {
                type: "text" as const,
                text: `Running (${Math.round(task.progress)}%). Check again shortly.`,
              },
            ],
          };
        case "finished":
          return {
            content: [
              {
                type: "text" as const,
                text: `Brand extracted: ID \`${task.brand_id}\`\nView: https://soldy.ai/app/brands/${task.brand_id}`,
              },
            ],
          };
        case "failed":
          return {
            content: [
              {
                type: "text" as const,
                text: `Extraction failed: ${task.reason || "unknown"}`,
              },
            ],
            isError: true,
          };
        default:
          return {
            content: [
              { type: "text" as const, text: `Status: ${task.status}` },
            ],
          };
      }
    },
  );
}
