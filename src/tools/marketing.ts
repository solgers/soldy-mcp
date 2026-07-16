import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SoldyAPIClient } from "../client.js";
import { formatApiError } from "../errors.js";
import { DEFAULT_WEB_URL, seedanceShareUrl } from "../web-links.js";

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

export function registerMarketingTools(
  server: McpServer,
  client: SoldyAPIClient,
  webUrl = DEFAULT_WEB_URL,
) {
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

Returns a \`task_id\` immediately; poll with \`get_seedance_task\`. Use this whenever the user has chosen a template or just wants a single video rendered from a prompt + reference.

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
    "List the user's Seedance / Marketing Studio task history (paginated; optional status filter).",
    {
      page: z.number().int().optional(),
      page_size: z.number().int().optional(),
      status: z.enum(["pending", "running", "succeeded", "failed"]).optional(),
    },
    async ({ page, page_size, status }) => {
      const params: Record<string, string> = { module_type: "marketing_studio" };
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
