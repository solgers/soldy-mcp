import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SoldyAPIClient } from "../client.js";
import { formatApiError } from "../errors.js";
import { DEFAULT_WEB_URL, seedanceShareUrl } from "../web-links.js";
import {
  confirmVideoAdChoices,
  VIDEO_AD_TEMPLATES,
  videoAdParameterCatalog,
} from "./video-ad-choices.js";

// ---------------------------------------------------------------------------
// Video Ads / Marketing Studio shared schemas + option catalog.
//
// The template list, parameter enums, and the user-confirmation gate live in
// ./video-ad-choices.ts. Backend source of truth is services/api:
// `_SeedanceMediaRef` struct + `seedanceAllowedModules` in
//   internal/transport/rest/project/seedance_direct.go
// The web preset metadata lives in
//   services/web/lib/generator/marketing-studio-presets.ts
// Keep them in sync with VIDEO_AD_TEMPLATES; the smoke test asserts drift.
// ---------------------------------------------------------------------------

const MEDIA_REF_SCHEMA = z.union([
  z.string(),
  z.object({ url: z.string(), id: z.string().optional() }),
]);

type MediaRefInput = z.infer<typeof MEDIA_REF_SCHEMA>;

function toRef(m: MediaRefInput): { url: string; id?: string } {
  return typeof m === "string" ? { url: m } : m;
}

export function registerMarketingTools(
  server: McpServer,
  client: SoldyAPIClient,
  webUrl = DEFAULT_WEB_URL,
) {
  server.tool(
    "plan_video_ad",
    `Return the full Video Ad / Marketing Studio option catalog — every template, every parameter choice with its default, and the user's own avatars and products — so you can PRESENT the options and let the user choose.

Call this FIRST for any "make me an ad / video ad / UGC / product video" request. Show the user the templates and the key parameters (aspect ratio, duration, resolution, model tier) and ask which they want. Do NOT pick a template or parameters on the user's behalf; only fall back to defaults if the user explicitly says "you choose" or "use defaults". Once the user has chosen, call \`seedance_generate\` — it will ask them to confirm the final settings before spending credits.`,
    {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async () => {
      // Best-effort: the catalog is always returned; the user's own avatars /
      // products are added when reachable so the model can offer real picks.
      const [avatars, products] = await Promise.all([
        client
          .get<
            Array<{
              id: string;
              name: string;
              description?: string;
              source?: string;
              thumbnail_url?: string;
              gcs_url?: string[];
            }>
          >("/public/avatar/list", { page: "1", page_size: "12" })
          .then((r) =>
            r.code === 0
              ? {
                  items: (r.data ?? []).map((a) => ({
                    id: a.id,
                    name: a.name,
                    description: a.description,
                    source: a.source,
                    url: a.gcs_url?.find((u) => u.trim().length > 0),
                  })),
                }
              : { error: formatApiError(r) },
          )
          .catch((e: unknown) => ({ error: String(e) })),
        client
          .get<Array<{ id: string; name: string; description?: string }>>(
            "/public/product/list",
            { page: "1", page_size: "12" },
          )
          .then((r) =>
            r.code === 0
              ? {
                  items: (r.data ?? []).map((p) => ({
                    id: p.id,
                    name: p.name,
                    description: p.description,
                  })),
                }
              : { error: formatApiError(r) },
          )
          .catch((e: unknown) => ({ error: String(e) })),
      ]);

      const catalog = {
        instructions:
          "Present these options to the user and let them choose before calling seedance_generate. Do not silently apply defaults.",
        templates: VIDEO_AD_TEMPLATES,
        parameters: videoAdParameterCatalog(),
        avatars: {
          ...avatars,
          note: "Selectable presenter avatars. Call avatar_search to browse more, or avatar_upload to add one; pass the chosen avatar's { id, url } into seedance_generate.image_url.",
        },
        products: {
          ...products,
          note: "Product-library objects. Call product_parse_url or product_create to add one; pass its image URLs into seedance_generate.image_url.",
        },
      };
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(catalog, null, 2) },
        ],
      };
    },
  );

  server.tool(
    "list_video_ad_templates",
    `List the available Video Ad / Marketing Studio templates. Each entry's \`value\` is what you pass as \`module\` to \`seedance_generate\`.

Prefer \`plan_video_ad\` when the user is starting an ad — it returns the templates AND the parameter choices AND the user's avatars/products in one call. Use this tool when you only need the template list to confirm a \`module\` value the user already named.`,
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
    `Generate a **Video Ad / Marketing Studio** video. Attach product/avatar references in \`image_url\`.

Call this only AFTER the user has chosen the template and parameters — run \`plan_video_ad\` first and let the user pick. Do not invent a \`module\`, \`ratio\`, \`duration\`, or \`resolution\` on the user's behalf; only apply defaults if the user explicitly said "you choose" / "use defaults". On clients that support it, this tool pops a confirmation form and the user must approve the final settings before any credits are spent (declining aborts the render).

Returns a \`task_id\` immediately; poll with \`get_seedance_task\`.

Allowed:
- model: "doubao-seedance-2-0-260128" (default) | "doubao-seedance-2-0-fast-260128" | "doubao-seedance-2-0-mini-260615" (Mini; 480p/720p only)
- resolution: "480p" | "720p" | "1080p" | "4k" | "1080P" (4k / 1080P are upscale tiers; 1080P requires Seedance 2.0)
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
        .enum([
          "doubao-seedance-2-0-260128",
          "doubao-seedance-2-0-fast-260128",
          "doubao-seedance-2-0-mini-260615",
        ])
        .optional()
        .describe(
          "Default doubao-seedance-2-0-260128. The -mini SKU supports 480p/720p only.",
        ),
      resolution: z
        .enum(["480p", "720p", "1080p", "4k", "1080P"])
        .optional()
        .describe(
          "Output resolution. Default 720p. 4k and 1080P are upscale tiers (Marketing Studio only; 1080P requires Seedance 2.0).",
        ),
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
      // User-first hard gate: confirm the ad type + parameters before spending
      // credits. On clients that support elicitation the user must accept (and
      // may edit) the settings; declining aborts. Otherwise falls through to
      // the model's args (the options-first prompt guidance is the backstop).
      const gate = await confirmVideoAdChoices(server, {
        module: args.module,
        ratio: args.ratio,
        duration: args.duration,
        resolution: args.resolution,
        model: args.model,
      });
      if (gate.status === "declined" || gate.status === "cancelled") {
        return {
          content: [
            {
              type: "text" as const,
              text: "No video was generated — you dismissed the settings confirmation. Tell me what to change (template, aspect ratio, duration, resolution, model) and I'll set it up again.",
            },
          ],
        };
      }
      const confirmed = gate.status === "accepted" ? gate.values : {};

      const body: Record<string, unknown> = { prompt: args.prompt };
      if (args.image_url?.length) body.image_url = args.image_url.map(toRef);
      if (args.video_url?.length) body.video_url = args.video_url.map(toRef);
      if (args.audio_url?.length) body.audio_url = args.audio_url.map(toRef);
      const effective = { ...args, ...confirmed };
      for (const k of [
        "duration",
        "ratio",
        "input_ratio",
        "model",
        "resolution",
        "module",
        "callback_url",
      ] as const) {
        const v = effective[k];
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
      const params: Record<string, string> = {
        module_type: "marketing_studio",
      };
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
