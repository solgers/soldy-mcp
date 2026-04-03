import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SoldyAPIClient } from "../client.js";
import { formatApiError } from "../errors.js";

interface Project {
  id: string;
  name: string;
  status: string;
  ratio: string;
  description: string;
  created_at: string;
  brand_id: string;
}

export function registerProjectTools(
  server: McpServer,
  client: SoldyAPIClient,
) {
  server.tool(
    "create_project",
    "Create a conversation project. After creation, use send_message to start generating.",
    {
      name: z.string(),
      brand_id: z.string().optional(),
      ratio: z
        .enum(["9:16", "16:9", "1:1", "4:3", "3:4", "3:2", "2:3", "21:9"])
        .optional()
        .describe(
          "Default video ratio. Can be overridden per message in send_message.",
        ),
      description: z.string().optional(),
    },
    async ({ name, brand_id, ratio, description }) => {
      const wsId = await client.getDefaultWorkspaceId();
      const resp = await client.post<Project>("/public/project", {
        name,
        slug: name
          .toLowerCase()
          .replace(/\s+/g, "-")
          .replace(/[^a-z0-9-]/g, ""),
        description: description ?? "",
        ratio: ratio ?? "9:16",
        workspace_id: wsId,
      });
      if (resp.code !== 0 || !resp.data)
        return {
          content: [{ type: "text" as const, text: formatApiError(resp) }],
          isError: true,
        };

      const p = resp.data;

      // Link brand if provided
      if (brand_id) {
        await client
          .post("/public/project/brand", { project_id: p.id, brand_id })
          .catch(() => {});
      }

      return {
        content: [
          {
            type: "text" as const,
            text: `Project created: **${p.name}** (ID: \`${p.id}\`, status: ${p.status})\nUse send_message to start generating.\nWeb: https://soldy.ai/app/chat/${p.id}`,
          },
        ],
      };
    },
  );

  server.tool(
    "get_project",
    "Get project details including name, status, ratio, brand, timestamps.",
    { project_id: z.string() },
    async ({ project_id }) => {
      const resp = await client.get<Project>("/public/project", {
        id: project_id,
      });
      if (resp.code !== 0 || !resp.data)
        return {
          content: [{ type: "text" as const, text: formatApiError(resp) }],
          isError: true,
        };

      const p = resp.data;
      return {
        content: [
          {
            type: "text" as const,
            text: `| Field | Value |\n|---|---|\n| ID | \`${p.id}\` |\n| Name | ${p.name} |\n| Status | ${p.status} |\n| Ratio | ${p.ratio} |\n| Created | ${p.created_at} |\n\nWeb: https://soldy.ai/app/chat/${p.id}`,
          },
        ],
      };
    },
  );

  server.tool(
    "list_projects",
    "List all projects with status.",
    { page: z.number().optional(), page_size: z.number().optional() },
    async ({ page, page_size }) => {
      const wsId = await client.getDefaultWorkspaceId();
      const params: Record<string, string> = { workspace_id: wsId };
      if (page) params.page = String(page);
      if (page_size) params.page_size = String(page_size);

      const resp = await client.get<Project[]>("/public/project/list", params);
      if (resp.code !== 0)
        return {
          content: [{ type: "text" as const, text: formatApiError(resp) }],
          isError: true,
        };

      const projects = resp.data ?? [];
      if (projects.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No projects yet. Use create_project to start.",
            },
          ],
        };
      }

      const total = resp.page?.total_count ?? projects.length;
      const lines = [
        `Total: ${total} (page ${page ?? 1})\n`,
        "| Name | ID | Status | Created |",
        "|---|---|---|---|",
      ];
      for (const p of projects) {
        lines.push(
          `| ${p.name} | \`${p.id}\` | ${p.status} | ${p.created_at?.slice(0, 16)} |`,
        );
      }
      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    },
  );

  server.tool(
    "get_project_status",
    `Get project status and latest run activity.

For long-running jobs, prefer watch_project(project_id) to subscribe for real-time status updates via resource notifications instead of polling this tool. You can also read the resource URI soldy://project/{project_id}/status directly.

Status meanings:
- ready: waiting for send_message
- running: agent is processing
- completed: generation finished — use get_project_materials or read soldy://project/{id}/materials
- pause: agent paused (credits or approval needed) — use continue_project to resume
- error: generation failed — use send_message to retry`,
    { project_id: z.string() },
    async ({ project_id }) => {
      const [projResp, msgResp] = await Promise.all([
        client.get<Project>("/public/project", { id: project_id }),
        client.get<Message[]>("/public/project/message/list", {
          project_id,
          page: "1",
          page_size: "30",
          sort: "created_at desc",
        }),
      ]);

      if (projResp.code !== 0 || !projResp.data) {
        return {
          content: [{ type: "text" as const, text: formatApiError(projResp) }],
          isError: true,
        };
      }

      const p = projResp.data;
      const messages = msgResp.data ?? [];

      let output = `**${p.name}** — Status: ${p.status}\n`;

      // Add actionable guidance per status
      switch (p.status) {
        case "pause":
          output += "⏸ Agent paused. Use continue_project to resume.\n";
          break;
        case "error":
          output +=
            "❌ Generation failed. Use send_message to start a new run.\n";
          break;
        case "completed":
          output +=
            "✅ Complete. Use get_project_materials to view results, or send_message to iterate.\n";
          break;
        case "running":
          output += "⏳ Processing. Poll again in a few seconds.\n";
          break;
      }

      if (messages.length > 0) {
        let latestRunId = "";
        for (const msg of messages) {
          if (msg.run_id) {
            latestRunId = msg.run_id;
            break;
          }
        }

        if (latestRunId) {
          const runMsgs = messages
            .filter((m) => m.run_id === latestRunId)
            .reverse();

          if (runMsgs.length > 0) {
            output += `\nLatest run (${runMsgs.length} events):\n`;
            for (const msg of runMsgs) {
              output += formatMessage(msg);
            }
          }
        }
      }

      output += `\nWeb: https://soldy.ai/app/chat/${project_id}`;
      return { content: [{ type: "text" as const, text: output }] };
    },
  );
}

interface Message {
  id: string;
  role: string;
  content: string;
  event: string;
  run_id: string;
  metadata: Record<string, unknown> | null;
  materials: Material[];
  tool: AgentTool | null;
  created_at: string;
}

interface Material {
  url: string;
  type: string;
  thumbnail?: string;
  display_title?: string;
}

interface AgentTool {
  name: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
}

const eventMap: Record<string, string> = {
  RunStarted: "Started processing",
  TeamRunStarted: "Started processing",
  ToolCallStarted: "Tool",
  ToolCallCompleted: "Tool completed",
  TeamToolCallStarted: "Tool",
  TeamToolCallCompleted: "Tool completed",
  RunContent: "",
  RunContentCompleted: "",
  RunCompleted: "Generation complete",
  TeamRunCompleted: "Generation complete",
  RunError: "Error",
  TeamRunError: "Error",
  RunPaused: "⏸ Paused",
  RunCancelled: "🚫 Cancelled",
  AgentSystemError: "⚠️ System error",
};

function formatMessage(msg: Message): string {
  const role = msg.role === "user" ? "[user]" : "[agent]";

  // Tool call events
  if (msg.event === "ToolCallStarted" || msg.event === "TeamToolCallStarted") {
    const toolName = msg.tool?.name ?? "unknown";
    return `  🔧 ${toolName}\n`;
  }
  if (
    msg.event === "ToolCallCompleted" ||
    msg.event === "TeamToolCallCompleted"
  ) {
    if (msg.content) return `  ✓ ${msg.content.slice(0, 120)}\n`;
    return "";
  }

  // Pause with reason
  if (msg.event === "RunPaused") {
    let pauseInfo = "⏸ Paused";
    if (msg.metadata) {
      const reason = msg.metadata.reason ?? msg.metadata.paused_reason;
      if (reason) pauseInfo += ` — ${reason}`;
    }
    return `${pauseInfo}\n  → Use continue_project to resume\n`;
  }

  // Status events
  const mapped = eventMap[msg.event];
  if (mapped === "") {
    if (msg.content) {
      const preview =
        msg.content.length > 200
          ? `${msg.content.slice(0, 200)}...`
          : msg.content;
      return `${role} ${preview}\n`;
    }
    return "";
  }
  if (mapped) {
    const extra = msg.content ? `: ${msg.content.slice(0, 100)}` : "";
    return `${mapped}${extra}\n`;
  }

  // Materials
  if (msg.materials?.length > 0) {
    const counts: Record<string, number> = {};
    for (const m of msg.materials) counts[m.type] = (counts[m.type] ?? 0) + 1;
    return `  📎 ${Object.entries(counts)
      .map(([t, n]) => `${n} ${t}`)
      .join(", ")}\n`;
  }

  if (msg.content) {
    const preview =
      msg.content.length > 200
        ? `${msg.content.slice(0, 200)}...`
        : msg.content;
    return `${role} ${preview}\n`;
  }

  return "";
}
