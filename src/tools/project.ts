import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SoldyAPIClient } from "../client.js";
import { formatApiError } from "../errors.js";
import { chatUrl, DEFAULT_WEB_URL, seedanceShareUrl } from "../web-links.js";

interface Project {
  id: string;
  name: string;
  status: string;
  ratio: string;
  description: string;
  created_at: string;
  brand_id: string;
}

// ---------------------------------------------------------------------------
// Video Ads / Marketing Studio shared schemas + template catalog
//
// Backend source of truth lives in services/api: `_SeedanceMediaRef` struct
// and `seedanceAllowedModules` in
//   internal/transport/rest/project/seedance_direct.go
// The web preset metadata lives in
//   services/web/lib/generator/marketing-studio-presets.ts
// Keep both in sync with the entries below; the smoke test asserts drift.
// ---------------------------------------------------------------------------

const MEDIA_REF_SCHEMA = z.union([
  z.string(),
  z.object({ url: z.string(), id: z.string().optional() }),
]);

type MediaRefInput = z.infer<typeof MEDIA_REF_SCHEMA>;

function toRef(m: MediaRefInput): { url: string; id?: string } {
  return typeof m === "string" ? { url: m } : m;
}

interface VideoAdTemplate {
  value: string;
  name: string;
  description: string;
}

// 9 user-facing templates + the implicit "Direct" fallback. `value` matches
// the backend's `seedanceAllowedModules` enum exactly.
const VIDEO_AD_TEMPLATES: VideoAdTemplate[] = [
  { value: "UGC", name: "UGC", description: "Authentic user-style content." },
  {
    value: "Tutorial",
    name: "Tutorial",
    description: "Step-by-step tutorials.",
  },
  {
    value: "Unboxing",
    name: "Unboxing",
    description: "High-quality unboxing.",
  },
  {
    value: "Hyper_Motion",
    name: "Hyper Motion",
    description: "Highlight your product with hyper-motion energy.",
  },
  {
    value: "Product_Review",
    name: "Product Review",
    description: "Authentic product review.",
  },
  {
    value: "TV_Spot",
    name: "TV Spot",
    description: "Authentic stories, broadcast-quality amplification.",
  },
  {
    value: "Wild_Card",
    name: "Wild Card",
    description: "Unique creative mode for custom ideas.",
  },
  {
    value: "UGC_Virtual_Try_On",
    name: "UGC Virtual Try On",
    description: "Try-before-you-buy in UGC style.",
  },
  {
    value: "Pro_Virtual_Try_On",
    name: "Pro Virtual Try On",
    description: "Advanced virtual try-on with polished output.",
  },
  {
    value: "Direct",
    name: "Direct",
    description:
      "Default fallback (no template). Generation runs from your prompt + media without a Marketing Studio preset.",
  },
];

export function registerProjectTools(
  server: McpServer,
  client: SoldyAPIClient,
  webUrl = DEFAULT_WEB_URL,
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
            text: `Project created: **${p.name}** (ID: \`${p.id}\`, status: ${p.status})\nUse send_message to start generating.\nWeb: ${chatUrl(webUrl, p.id)}`,
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
            text: `| Field | Value |\n|---|---|\n| ID | \`${p.id}\` |\n| Name | ${p.name} |\n| Status | ${p.status} |\n| Ratio | ${p.ratio} |\n| Created | ${p.created_at} |\n\nWeb: ${chatUrl(webUrl, p.id)}`,
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

      output += `\nWeb: ${chatUrl(webUrl, project_id)}`;
      return { content: [{ type: "text" as const, text: output }] };
    },
  );

  // ---------------------------------------------------------------------
  // copy / gen-name / showcase / seedance
  // ---------------------------------------------------------------------

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

  // -- Video Ads / Marketing Studio (one-shot template-driven generation)
  //
  // First-class peer to the conversational `chat` path. Use when the user has
  // picked a template (UGC, Tutorial, Unboxing, ...) or just wants a single
  // video rendered — not when they want creative direction & iteration.

  server.tool(
    "list_video_ad_templates",
    `List the available Video Ad / Marketing Studio templates. Each entry's \`value\` is what you pass as \`module\` to \`seedance_generate\`.

Call this whenever the user asks for a template-style ad ("UGC", "unboxing video", "product review", "tutorial", etc.) and you need to confirm the available presets or pick the right \`module\` value. The list is small and stable; you can also pass \`module\` directly if you already know the value.`,
    {},
    async () => ({
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(VIDEO_AD_TEMPLATES, null, 2),
        },
      ],
    }),
  );

  server.tool(
    "seedance_generate",
    `Generate a **Video Ad / Marketing Studio** video. Pick a \`module\` template (call \`list_video_ad_templates\` for the full catalog with descriptions) and attach product/avatar references in \`image_url\`.

Returns a \`task_id\` immediately; poll with \`get_seedance_task\`. Use this whenever the user has chosen a template or just wants a single video rendered from a prompt + reference. For multi-shot, brand-aware, conversational creative direction, use \`chat\` instead — both paths are first-class.

Allowed:
- model: "doubao-seedance-2-0-260128" (default) | "doubao-seedance-2-0-fast-260128"
- resolution: "480p" | "720p" | "1080p"
- ratio / input_ratio: "16:9" | "4:3" | "1:1" | "3:4" | "9:16" | "21:9" | "adaptive" (default 9:16)
- duration: -1 (auto) or 4-15 seconds (default 10)
- module: "Direct" (default; no template) | "UGC" | "Tutorial" | "Unboxing" | "Hyper_Motion" | "Product_Review" | "TV_Spot" | "Wild_Card" | "UGC_Virtual_Try_On" | "Pro_Virtual_Try_On"`,
    {
      prompt: z.string().describe("Generation prompt."),
      image_url: z
        .array(MEDIA_REF_SCHEMA)
        .optional()
        .describe(
          "Reference image(s). Plain URL strings, or { url, id } objects where `id` references an item from the user's material library (same shape the web Video Ads composer sends).",
        ),
      video_url: z
        .array(MEDIA_REF_SCHEMA)
        .optional()
        .describe(
          "Reference video(s). Plain URL strings, or { url, id } objects (same shape as image_url).",
        ),
      audio_url: z
        .array(MEDIA_REF_SCHEMA)
        .optional()
        .describe(
          "Reference audio track(s). Plain URL strings, or { url, id } objects (same shape as image_url).",
        ),
      duration: z
        .number()
        .int()
        .optional()
        .describe("Seconds. -1 (auto) or 4-15. Default 10."),
      ratio: z
        .enum(["16:9", "4:3", "1:1", "3:4", "9:16", "21:9", "adaptive"])
        .optional()
        .describe("Output aspect ratio. Default 9:16."),
      input_ratio: z
        .enum(["16:9", "4:3", "1:1", "3:4", "9:16", "21:9", "adaptive"])
        .optional()
        .describe(
          "Input reference aspect ratio. When set, the backend uses this in place of `ratio` for downstream tooling. Same allowed values as `ratio`.",
        ),
      model: z
        .enum(["doubao-seedance-2-0-260128", "doubao-seedance-2-0-fast-260128"])
        .optional()
        .describe("Default doubao-seedance-2-0-260128."),
      resolution: z
        .enum(["480p", "720p", "1080p"])
        .optional()
        .describe("Output resolution. Default 720p."),
      module: z
        .enum([
          "UGC",
          "Direct",
          "Tutorial",
          "Unboxing",
          "Hyper_Motion",
          "Product_Review",
          "TV_Spot",
          "Wild_Card",
          "UGC_Virtual_Try_On",
          "Pro_Virtual_Try_On",
        ])
        .optional()
        .describe(
          "Marketing Studio template. Call list_video_ad_templates to see descriptions. Default Direct (no template).",
        ),
      callback_url: z
        .string()
        .url()
        .optional()
        .describe(
          "Optional HTTPS URL for Volcano Ark task callbacks (http only for localhost). Forwarded as callback_url on create.",
        ),
    },
    async (args) => {
      const body: Record<string, unknown> = { prompt: args.prompt };
      if (args.image_url?.length) body.image_url = args.image_url.map(toRef);
      if (args.video_url?.length) body.video_url = args.video_url.map(toRef);
      if (args.audio_url?.length) body.audio_url = args.audio_url.map(toRef);
      for (const k of [
        "duration",
        "ratio",
        "input_ratio",
        "model",
        "resolution",
        "module",
        "callback_url",
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
            text: `Seedance task submitted (task: \`${resp.data.task_id}\`, status: ${resp.data.status}).\nShare: ${seedanceShareUrl(webUrl, resp.data.task_id)}\nPoll with get_seedance_task. Generation typically takes 1-3 minutes.`,
          },
        ],
      };
    },
  );

  server.tool(
    "get_seedance_share_link",
    "Return the public read-only share URL for a Video Ad / Marketing Studio Seedance task. Use after seedance_generate or for any task from list_seedance_history.",
    { task_id: z.string() },
    async ({ task_id }) => ({
      content: [
        {
          type: "text" as const,
          text: `Share: ${seedanceShareUrl(webUrl, task_id)}`,
        },
      ],
    }),
  );

  server.tool(
    "get_seedance_task",
    "Poll a Seedance task by ID. Returns status (pending/running/succeeded/failed), the public read-only share URL, and the result JSON when done.",
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
      lines.push(`Share: ${seedanceShareUrl(webUrl, d.id)}`);
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
    "List the user's Seedance task history (paginated; optional status and module_type marketing_studio|recast_studio).",
    {
      page: z.number().int().optional(),
      page_size: z.number().int().optional(),
      status: z.enum(["pending", "running", "succeeded", "failed"]).optional(),
      module_type: z.enum(["marketing_studio", "recast_studio"]).optional(),
    },
    async ({ page, page_size, status, module_type }) => {
      const params: Record<string, string> = {};
      if (page) params.page = String(page);
      if (page_size) params.page_size = String(page_size);
      if (status) params.status = status;
      if (module_type) params.module_type = module_type;
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
        "| ID | Status | Share | Ratio | Duration | Cost | Prompt |",
        "|---|---|---|---|---|---|---|",
      ];
      for (const it of items) {
        const promptPreview = (it.prompt ?? "")
          .replace(/\n/g, " ")
          .slice(0, 60);
        lines.push(
          `| \`${it.id}\` | ${it.status} | [Link](${seedanceShareUrl(webUrl, it.id)}) | ${it.ratio ?? "—"} | ${it.duration ?? "—"}s | ${it.charged_cost ?? 0} | ${promptPreview} |`,
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
