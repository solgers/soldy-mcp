import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SoldyAPIClient } from "../client.js";
import { formatApiError } from "../errors.js";

interface ToolTask {
  id: string;
  workspace_id: string;
  tool_name: string;
  status: string;
  input?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
  created_at?: string;
}

const TOOL_TERMINAL = new Set(["succeeded", "failed", "completed", "error"]);

async function pollToolTask(
  client: SoldyAPIClient,
  workspaceId: string,
  taskId: string,
  timeoutSeconds: number,
): Promise<ToolTask | { timedOut: true }> {
  const deadlineMs = Date.now() + timeoutSeconds * 1000;
  const pollIntervalMs = 4000;
  while (Date.now() < deadlineMs) {
    await new Promise((r) => setTimeout(r, pollIntervalMs));
    try {
      const resp = await client.post<ToolTask[]>("/public/tools/task/result", {
        task_ids: [taskId],
        workspace_id: workspaceId,
      });
      const task = resp.data?.[0];
      if (!task) continue;
      if (TOOL_TERMINAL.has(task.status)) return task;
    } catch {
      // transient — keep polling
    }
  }
  return { timedOut: true };
}

function renderToolTaskResult(task: ToolTask): string {
  const lines = [
    `Tool: ${task.tool_name}`,
    `Status: ${task.status}`,
    `Task ID: \`${task.id}\``,
  ];
  if (task.error) lines.push(`Error: ${task.error}`);
  if (task.result) {
    lines.push("");
    lines.push("Result:");
    lines.push(`\`\`\`json\n${JSON.stringify(task.result, null, 2)}\n\`\`\``);
  }
  return lines.join("\n");
}

export function registerStandaloneTools(
  server: McpServer,
  client: SoldyAPIClient,
) {
  // ---------------------------------------------------------------------
  // Look Reference — generate a cinematic look reference (clean scene
  // image + annotated palette board) from a scene description + locked
  // 4-color palette. Async; polls until done by default.
  // ---------------------------------------------------------------------
  server.tool(
    "generate_look_reference",
    `Generate a cinematic look reference (clean scene image + annotated palette board) from a written scene description plus a locked 4-color palette.

\`hex_palette\` must include all four keys: primary, secondary, accent, shadow (each "#RRGGBB"). Optional fields fine-tune tone: lighting, atmosphere, textures, ratio (default "16:9"). When include_product=true, supply product_image_url so the agent inserts it into the scene.

With wait=true (default), blocks until the agent finishes (~1-3 min) and returns the result. With wait=false, returns a task_id for manual polling via get_tool_task.

NOTE: gated server-side by the tools_access Statsig dynamic config.`,
    {
      scene_description: z.string(),
      hex_palette: z.object({
        primary: z.string(),
        secondary: z.string(),
        accent: z.string(),
        shadow: z.string(),
      }),
      lighting: z.string().optional(),
      atmosphere: z.string().optional(),
      textures: z.string().optional(),
      ratio: z.string().optional(),
      include_product: z.boolean().optional(),
      product_image_url: z.string().optional(),
      wait: z.boolean().optional(),
      timeout_seconds: z.number().int().optional(),
    },
    async (args) => {
      const wsId = await client.getDefaultWorkspaceId();
      const body: Record<string, unknown> = {
        workspace_id: wsId,
        scene_description: args.scene_description,
        hex_palette: args.hex_palette,
        ratio: args.ratio ?? "16:9",
        include_product: args.include_product ?? false,
      };
      for (const k of [
        "lighting",
        "atmosphere",
        "textures",
        "product_image_url",
      ] as const) {
        const v = args[k];
        if (v !== undefined && v !== "") body[k] = v;
      }

      const resp = await client.post<ToolTask>(
        "/public/tools/look-reference",
        body,
      );
      if (resp.code !== 0 || !resp.data) {
        return {
          content: [{ type: "text" as const, text: formatApiError(resp) }],
          isError: true,
        };
      }
      const taskId = resp.data.id;

      if (args.wait === false) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Look reference task started (task: \`${taskId}\`). Poll with get_tool_task. Usually takes 1-3 min.`,
            },
          ],
        };
      }

      const polled = await pollToolTask(
        client,
        wsId,
        taskId,
        args.timeout_seconds ?? 600,
      );
      if ("timedOut" in polled) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Look reference still running (task: \`${taskId}\`). Use get_tool_task to check.`,
            },
          ],
        };
      }
      const isErr =
        polled.status === "failed" ||
        polled.status === "error" ||
        Boolean(polled.error);
      return {
        content: [
          { type: "text" as const, text: renderToolTaskResult(polled) },
        ],
        ...(isErr ? { isError: true } : {}),
      };
    },
  );

  // ---------------------------------------------------------------------
  // Cast Design — generate character archetypes + visual prompts from a
  // free-form description. Methodology details (archetype, hyperbole
  // trait) are inferred LLM-side.
  // ---------------------------------------------------------------------
  server.tool(
    "generate_cast_design",
    `Generate a character cast brief from a free-form description (archetype, hyperbole trait, hero image per member). Methodology parameters are inferred by the LLM.

\`style_mode\`: "realistic" (default) | "stylized" | "cartoon". \`reference_images\` and \`context\` are optional. Per-member hero image \`ratio\` defaults to 9:16.

With wait=true (default), blocks until done (~5-10 min for multi-member casts). With wait=false, returns task_id for manual polling.

NOTE: gated by the tools_access Statsig dynamic config.`,
    {
      description: z.string(),
      context: z.string().optional(),
      style_mode: z.enum(["realistic", "stylized", "cartoon"]).optional(),
      reference_images: z.array(z.string()).optional(),
      ratio: z.string().optional(),
      wait: z.boolean().optional(),
      timeout_seconds: z.number().int().optional(),
    },
    async (args) => {
      const wsId = await client.getDefaultWorkspaceId();
      const body: Record<string, unknown> = {
        workspace_id: wsId,
        description: args.description,
      };
      for (const k of [
        "context",
        "style_mode",
        "reference_images",
        "ratio",
      ] as const) {
        const v = args[k];
        if (v !== undefined && v !== "") body[k] = v;
      }

      const resp = await client.post<ToolTask>(
        "/public/tools/cast-design",
        body,
      );
      if (resp.code !== 0 || !resp.data) {
        return {
          content: [{ type: "text" as const, text: formatApiError(resp) }],
          isError: true,
        };
      }
      const taskId = resp.data.id;

      if (args.wait === false) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Cast design task started (task: \`${taskId}\`). Poll with get_tool_task. Usually 5-10 min.`,
            },
          ],
        };
      }

      const polled = await pollToolTask(
        client,
        wsId,
        taskId,
        args.timeout_seconds ?? 900,
      );
      if ("timedOut" in polled) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Cast design still running (task: \`${taskId}\`). Use get_tool_task to check.`,
            },
          ],
        };
      }
      const isErr =
        polled.status === "failed" ||
        polled.status === "error" ||
        Boolean(polled.error);
      return {
        content: [
          { type: "text" as const, text: renderToolTaskResult(polled) },
        ],
        ...(isErr ? { isError: true } : {}),
      };
    },
  );

  // ---------------------------------------------------------------------
  // Tool task polling + history
  // ---------------------------------------------------------------------
  server.tool(
    "get_tool_task",
    "Poll one tool task (look-reference, cast-design, etc.) by task_id. Use this when you called *_generate with wait=false.",
    { task_id: z.string() },
    async ({ task_id }) => {
      const wsId = await client.getDefaultWorkspaceId();
      const resp = await client.post<ToolTask[]>("/public/tools/task/result", {
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
      const isErr =
        task.status === "failed" ||
        task.status === "error" ||
        Boolean(task.error);
      return {
        content: [{ type: "text" as const, text: renderToolTaskResult(task) }],
        ...(isErr ? { isError: true } : {}),
      };
    },
  );

  server.tool(
    "list_tool_tasks",
    "List recent tool tasks (look-reference, cast-design, ...) for the workspace, newest first. Optional tool_name filter.",
    {
      tool_name: z.string().optional(),
      limit: z.number().int().optional(),
    },
    async ({ tool_name, limit }) => {
      const wsId = await client.getDefaultWorkspaceId();
      const params: Record<string, string> = { workspace_id: wsId };
      if (tool_name) params.tool_name = tool_name;
      if (limit) params.limit = String(limit);
      const resp = await client.get<ToolTask[]>(
        "/public/tools/tasks/list",
        params,
      );
      if (resp.code !== 0) {
        return {
          content: [{ type: "text" as const, text: formatApiError(resp) }],
          isError: true,
        };
      }
      const tasks = resp.data ?? [];
      if (tasks.length === 0) {
        return {
          content: [{ type: "text" as const, text: "No tool tasks yet." }],
        };
      }
      const lines = [
        `Total ${resp.page?.total_count ?? tasks.length}`,
        "",
        "| Task ID | Tool | Status | Created |",
        "|---|---|---|---|",
      ];
      for (const t of tasks) {
        lines.push(
          `| \`${t.id}\` | ${t.tool_name} | ${t.status} | ${(t.created_at ?? "").slice(0, 16)} |`,
        );
      }
      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    },
  );
}
