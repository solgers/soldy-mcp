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

Quick status check. For blocking workflow, prefer \`chat\` which waits for completion automatically. For async follow-up, use \`get_updates\`.

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

  // ---------------------------------------------------------------------
  // Chronicle / copy / gen-name / showcase / seedance
  // ---------------------------------------------------------------------

  server.tool(
    "get_project_chronicle",
    "Get the project's session chronicle markdown — a running narrative the agent writes for itself across the conversation. Returns null if the agent hasn't written one yet.",
    { project_id: z.string() },
    async ({ project_id }) => {
      const resp = await client.get<{
        content: string;
        updated_at: string;
        file_name: string;
      } | null>("/public/project/chronicle", { id: project_id });
      if (resp.code !== 0) {
        return {
          content: [{ type: "text" as const, text: formatApiError(resp) }],
          isError: true,
        };
      }
      if (!resp.data || !resp.data.content) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No chronicle yet — the agent hasn't written one for this project.",
            },
          ],
        };
      }
      return {
        content: [
          {
            type: "text" as const,
            text: `Chronicle (${resp.data.file_name}, updated ${resp.data.updated_at}):\n\n${resp.data.content}`,
          },
        ],
      };
    },
  );

  server.tool(
    "copy_project",
    "Copy a project plus its messages, brand/product assignments. Returns the new project. NOTE: this endpoint is debug-gated server-side — only works for accounts with the enable_debug Statsig gate enabled.",
    { project_id: z.string() },
    async ({ project_id }) => {
      const resp = await client.post<Project>("/public/project/copy", {
        project_id,
      });
      if (resp.code !== 0 || !resp.data) {
        return {
          content: [{ type: "text" as const, text: formatApiError(resp) }],
          isError: true,
        };
      }
      const p = resp.data;
      return {
        content: [
          {
            type: "text" as const,
            text: `Project copied: **${p.name}** (new ID: \`${p.id}\`, source: \`${project_id}\`)`,
          },
        ],
      };
    },
  );

  server.tool(
    "generate_project_name",
    "Use the agent to generate a fresh project name (typically derived from the first user message). Returns the suggested name.",
    { project_id: z.string() },
    async ({ project_id }) => {
      const resp = await client.post<{ name: string }>(
        "/public/project/gen-name",
        { project_id },
      );
      if (resp.code !== 0 || !resp.data) {
        return {
          content: [{ type: "text" as const, text: formatApiError(resp) }],
          isError: true,
        };
      }
      return {
        content: [
          {
            type: "text" as const,
            text: `Suggested name: ${resp.data.name}`,
          },
        ],
      };
    },
  );

  server.tool(
    "add_showcase",
    "Add a project to the org's showcase gallery. NOTE: debug-gated server-side.",
    { project_id: z.string() },
    async ({ project_id }) => {
      const resp = await client.post("/public/project/showcase", {
        project_id,
      });
      if (resp.code !== 0) {
        return {
          content: [{ type: "text" as const, text: formatApiError(resp) }],
          isError: true,
        };
      }
      return {
        content: [
          { type: "text" as const, text: `Project ${project_id} showcased.` },
        ],
      };
    },
  );

  server.tool(
    "remove_showcase",
    "Remove a project from the org's showcase gallery. NOTE: debug-gated server-side.",
    { project_id: z.string() },
    async ({ project_id }) => {
      const resp = await client.delete("/public/project/showcase", {
        body: { project_id },
      });
      if (resp.code !== 0) {
        return {
          content: [{ type: "text" as const, text: formatApiError(resp) }],
          isError: true,
        };
      }
      return {
        content: [
          {
            type: "text" as const,
            text: `Project ${project_id} removed from showcase.`,
          },
        ],
      };
    },
  );

  server.tool(
    "list_showcase",
    "List the org's showcased projects.",
    {
      page: z.number().int().optional(),
      page_size: z.number().int().optional(),
    },
    async ({ page, page_size }) => {
      const params: Record<string, string> = {};
      if (page) params.page = String(page);
      if (page_size) params.page_size = String(page_size);
      const resp = await client.get<
        Array<{ id: string; project_id: string; created_at: string }>
      >("/public/project/showcase/list", params);
      if (resp.code !== 0) {
        return {
          content: [{ type: "text" as const, text: formatApiError(resp) }],
          isError: true,
        };
      }
      const items = resp.data ?? [];
      if (items.length === 0) {
        return {
          content: [
            { type: "text" as const, text: "No showcased projects yet." },
          ],
        };
      }
      const lines = [
        `Total ${resp.page?.total_count ?? items.length}, page ${page ?? 1}`,
        "",
        "| Showcase ID | Project ID | Created |",
        "|---|---|---|",
      ];
      for (const it of items) {
        lines.push(
          `| \`${it.id}\` | \`${it.project_id}\` | ${(it.created_at ?? "").slice(0, 16)} |`,
        );
      }
      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    },
  );

  // -- Seedance direct (non-conversational; orchestrate generation in one shot)

  server.tool(
    "seedance_generate",
    `Submit a Seedance video task directly (bypasses the conversational agent). Returns a task_id immediately; poll with \`get_seedance_task\`.

Use when you want raw control: just a prompt + media + duration/ratio, no creative-direction back-and-forth. For creative iteration, prefer \`chat\` with input_mode="seedance".

Allowed:
- model: "doubao-seedance-2-0-260128" (default) | "doubao-seedance-2-0-fast-260128"
- resolution: "480p" | "720p" | "1080p"
- ratio: "16:9" | "4:3" | "1:1" | "3:4" | "9:16" | "21:9" | "adaptive"
- duration: -1 (auto) or 4-15 seconds (default 10)
- module: "Direct" (default) | "UGC" | "Tutorial" | "Unboxing" | "Hyper_Motion" | "Product_Review" | "TV_Spot" | "Wild_Card" | "UGC_Virtual_Try_On" | "Pro_Virtual_Try_On"`,
    {
      prompt: z.string(),
      image_url: z.array(z.string()).optional(),
      video_url: z.array(z.string()).optional(),
      audio_url: z.array(z.string()).optional(),
      duration: z.number().int().optional(),
      ratio: z.string().optional(),
      input_ratio: z.string().optional(),
      model: z.string().optional(),
      resolution: z.enum(["480p", "720p", "1080p"]).optional(),
      module: z.string().optional(),
    },
    async (args) => {
      const body: Record<string, unknown> = { prompt: args.prompt };
      if (args.image_url?.length)
        body.image_url = args.image_url.map((url) => ({ url }));
      if (args.video_url?.length)
        body.video_url = args.video_url.map((url) => ({ url }));
      if (args.audio_url?.length)
        body.audio_url = args.audio_url.map((url) => ({ url }));
      for (const k of [
        "duration",
        "ratio",
        "input_ratio",
        "model",
        "resolution",
        "module",
      ] as const) {
        const v = args[k];
        if (v !== undefined) body[k] = v;
      }

      const resp = await client.post<{ task_id: string; status: string }>(
        "/public/project/seedance/generate",
        body,
      );
      if (resp.code !== 0 || !resp.data) {
        return {
          content: [{ type: "text" as const, text: formatApiError(resp) }],
          isError: true,
        };
      }
      return {
        content: [
          {
            type: "text" as const,
            text: `Seedance task submitted (task: \`${resp.data.task_id}\`, status: ${resp.data.status}).\nPoll with get_seedance_task. Generation typically takes 1-3 minutes.`,
          },
        ],
      };
    },
  );

  server.tool(
    "get_seedance_task",
    "Poll a Seedance task by ID. Returns status (pending/running/succeeded/failed) and the result JSON when done.",
    { task_id: z.string() },
    async ({ task_id }) => {
      const resp = await client.get<{
        id: string;
        status: string;
        prompt: string;
        result?: Record<string, unknown>;
        error?: string;
        charged_cost?: number;
      }>("/public/project/seedance/task", { task_id });
      if (resp.code !== 0 || !resp.data) {
        return {
          content: [{ type: "text" as const, text: formatApiError(resp) }],
          isError: true,
        };
      }
      const d = resp.data;
      const lines = [`Status: ${d.status}`, `Task ID: \`${d.id}\``];
      if (d.error) lines.push(`Error: ${d.error}`);
      if (d.charged_cost != null)
        lines.push(`Credits charged: ${d.charged_cost}`);
      if (d.result) {
        lines.push("Result:");
        lines.push(`\`\`\`json\n${JSON.stringify(d.result, null, 2)}\n\`\`\``);
      }
      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    },
  );

  server.tool(
    "list_seedance_history",
    "List the user's Seedance task history (paginated, optional status filter).",
    {
      page: z.number().int().optional(),
      page_size: z.number().int().optional(),
      status: z.enum(["pending", "running", "succeeded", "failed"]).optional(),
    },
    async ({ page, page_size, status }) => {
      const params: Record<string, string> = {};
      if (page) params.page = String(page);
      if (page_size) params.page_size = String(page_size);
      if (status) params.status = status;
      const resp = await client.get<
        Array<{
          id: string;
          status: string;
          prompt: string;
          model?: string;
          ratio?: string;
          duration?: number;
          charged_cost?: number;
          created_at?: string;
        }>
      >("/public/project/seedance/history", params);
      if (resp.code !== 0) {
        return {
          content: [{ type: "text" as const, text: formatApiError(resp) }],
          isError: true,
        };
      }
      const items = resp.data ?? [];
      if (items.length === 0) {
        return {
          content: [{ type: "text" as const, text: "No Seedance tasks yet." }],
        };
      }
      const lines = [
        `Total ${resp.page?.total_count ?? items.length}, page ${page ?? 1}`,
        "",
        "| ID | Status | Ratio | Duration | Cost | Prompt |",
        "|---|---|---|---|---|---|",
      ];
      for (const it of items) {
        const promptPreview = (it.prompt ?? "")
          .replace(/\n/g, " ")
          .slice(0, 60);
        lines.push(
          `| \`${it.id}\` | ${it.status} | ${it.ratio ?? "—"} | ${it.duration ?? "—"}s | ${it.charged_cost ?? 0} | ${promptPreview} |`,
        );
      }
      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
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
