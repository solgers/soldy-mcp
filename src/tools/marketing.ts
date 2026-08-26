import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SoldyAPIClient } from "../client.js";
import { formatApiError } from "../errors.js";
import { DEFAULT_WEB_URL, seedanceShareUrl } from "../web-links.js";
import {
  confirmVideoAdChoices,
  DIRECT_VIDEO_AD_TEMPLATE,
  type DurationRange,
  HOOK_SELECTION_SOURCES,
  isHookCapableModule,
  LEGACY_VIDEO_AD_TEMPLATES,
  MODULE_ENUM_VALUES,
  templateDurationRange,
  VIDEO_AD_TEMPLATES,
  videoAdParameterCatalog,
} from "./video-ad-choices.js";

// ---------------------------------------------------------------------------
// Video Ads / Marketing Studio shared schemas + option catalog.
//
// The module catalog, parameter enums, and the user-confirmation gate live in
// ./video-ad-choices.ts. Backend source of truth is services/api:
// `_SeedanceGenerateVideoReq` + `seedanceAllowedModules` in
//   internal/transport/rest/project/seedance_direct.go
// and the published template rows behind GET /public/marketing/templates,
// which `plan_video_ad` reads live — the web composer
// (services/web/lib/generator/marketing-studio-template-mapper.ts) builds its
// preset wall from exactly the same rows.
// ---------------------------------------------------------------------------

const MEDIA_REF_SCHEMA = z.union([
  z.string(),
  z.object({
    url: z.string(),
    id: z.string().optional(),
    thumbnail_url: z.string().optional(),
    /** Marketing Studio library role, on image_url entries only. */
    type: z.enum(["product", "avatar", "image"]).optional(),
  }),
]);

type MediaRefInput = z.infer<typeof MEDIA_REF_SCHEMA>;

function toRef(m: MediaRefInput): Record<string, string> {
  if (typeof m === "string") return { url: m };
  const ref: Record<string, string> = { url: m.url };
  if (m.id) ref.id = m.id;
  if (m.thumbnail_url) ref.thumbnail_url = m.thumbnail_url;
  if (m.type) ref.type = m.type;
  return ref;
}

// --- Live catalog shapes (subset of the API response we actually use) ------

interface MarketingTemplateRow {
  id: string;
  template_key: string;
  template_name?: string;
  template_description?: string;
  category?: string;
  video_order?: number;
  display_order?: number;
  preview_video_url?: string;
  video_url?: string;
  poster_url?: string;
  recreate_payload?: {
    module?: string;
    model?: string;
    ratio?: string;
    duration?: number;
    resolution?: string;
  };
  hook_config?: unknown;
}

interface HookTemplateRow {
  id: string;
  name: string;
  description?: string;
  category?: string;
  source_type?: string;
  video_url?: string;
}

interface PlannedTemplate {
  marketing_template_id: string;
  template_key: string;
  name: string;
  description: string;
  category?: string;
  module?: string;
  requires_avatar: boolean;
  hook_capable: boolean;
  hook_policy: string;
  duration_range: DurationRange;
  duration_range_with_hook: DurationRange | null;
  defaults?: {
    model?: string;
    ratio?: string;
    duration?: number;
    resolution?: string;
  };
  preview_url?: string;
}

function hookPolicyMode(hookConfig: unknown): string {
  if (!hookConfig || typeof hookConfig !== "object") return "inherit";
  const mode = (hookConfig as Record<string, unknown>).mode;
  return typeof mode === "string" && mode.trim() ? mode.trim() : "inherit";
}

function staticTemplateFor(module: string | undefined) {
  const trimmed = module?.trim();
  if (!trimmed) return undefined;
  return [
    ...VIDEO_AD_TEMPLATES,
    ...LEGACY_VIDEO_AD_TEMPLATES,
    DIRECT_VIDEO_AD_TEMPLATE,
  ].find((t) => t.value === trimmed);
}

/**
 * Collapse the published template rows into one entry per `template_key` (the
 * web preset wall groups the same way — extra rows are alternate preview
 * videos of the same preset, not separate templates).
 */
function toPlannedTemplates(rows: MarketingTemplateRow[]): PlannedTemplate[] {
  const byKey = new Map<string, MarketingTemplateRow>();
  for (const row of rows) {
    const key = row.template_key?.trim();
    if (!key) continue;
    const current = byKey.get(key);
    if (!current || (row.video_order ?? 0) < (current.video_order ?? 0)) {
      byKey.set(key, row);
    }
  }

  // Same ordering as the web preset wall: display_order, then name.
  const ordered = [...byKey.values()].sort((a, b) => {
    const orderA = a.display_order ?? Number.MAX_SAFE_INTEGER;
    const orderB = b.display_order ?? Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) return orderA - orderB;
    return (a.template_name ?? a.template_key).localeCompare(
      b.template_name ?? b.template_key,
    );
  });

  const planned: PlannedTemplate[] = [];
  for (const row of ordered) {
    const module = row.recreate_payload?.module?.trim();
    const meta = staticTemplateFor(module);
    const hookMode = hookPolicyMode(row.hook_config);
    const hookCapable = hookMode !== "disabled" && isHookCapableModule(module);
    planned.push({
      marketing_template_id: row.id,
      template_key: row.template_key,
      name: row.template_name?.trim() || meta?.name || row.template_key,
      description: row.template_description?.trim() || meta?.description || "",
      category: row.category,
      module,
      requires_avatar: meta?.requiresAvatar ?? false,
      hook_capable: hookCapable,
      hook_policy: hookMode,
      duration_range: templateDurationRange(row.hook_config, false),
      duration_range_with_hook: hookCapable
        ? templateDurationRange(row.hook_config, true)
        : null,
      defaults: row.recreate_payload
        ? {
            model: row.recreate_payload.model,
            ratio: row.recreate_payload.ratio,
            duration: row.recreate_payload.duration,
            resolution: row.recreate_payload.resolution,
          }
        : undefined,
      preview_url:
        row.preview_video_url?.trim() ||
        row.video_url?.trim() ||
        row.poster_url?.trim() ||
        undefined,
    });
  }
  return planned;
}

export function registerMarketingTools(
  server: McpServer,
  client: SoldyAPIClient,
  webUrl = DEFAULT_WEB_URL,
) {
  /** Published Marketing Studio templates (the web preset wall's own source). */
  async function fetchPublishedTemplates(): Promise<
    { items: PlannedTemplate[] } | { error: string }
  > {
    try {
      const resp = await client.get<MarketingTemplateRow[]>(
        "/public/marketing/templates",
        { page: "1", page_size: "100" },
      );
      if (resp.code !== 0) return { error: formatApiError(resp) };
      return { items: toPlannedTemplates(resp.data ?? []) };
    } catch (e: unknown) {
      return { error: String(e) };
    }
  }

  /** Hooks Studio opening-hook library (presets + the user's own hooks). */
  async function fetchHooks(
    pageSize: number,
  ): Promise<
    { presets: HookTemplateRow[]; user: HookTemplateRow[] } | { error: string }
  > {
    try {
      const [presets, user] = await Promise.all([
        client.get<HookTemplateRow[]>("/public/hook-templates/presets", {
          page: "1",
          page_size: String(pageSize),
        }),
        client
          .get<HookTemplateRow[]>("/public/hook-templates/user/list", {
            page: "1",
            page_size: String(pageSize),
          })
          .catch(() => ({ code: -1, msg: "", data: [] })),
      ]);
      if (presets.code !== 0) return { error: formatApiError(presets) };
      return {
        presets: presets.data ?? [],
        user: user.code === 0 ? (user.data ?? []) : [],
      };
    } catch (e: unknown) {
      return { error: String(e) };
    }
  }

  function summarizeHook(hook: HookTemplateRow) {
    return {
      hook_id: hook.id,
      name: hook.name,
      description: hook.description,
      category: hook.category,
      source: hook.source_type,
    };
  }

  server.tool(
    "plan_video_ad",
    `Return the full Video Ad / Marketing Studio option catalog — every published template with its id and duration limits, every parameter choice with its default, the opening-hook library, and the user's own avatars and products — so you can PRESENT the options and let the user choose.

Call this FIRST for any "make me an ad / video ad / UGC / product video" request. Show the user the templates and the key parameters (aspect ratio, duration, resolution, model tier) and ask which they want. Do NOT pick a template or parameters on the user's behalf; only fall back to defaults if the user explicitly says "you choose" or "use defaults". Once the user has chosen, call \`seedance_generate\` with both the template's \`module\` and its \`marketing_template_id\` — it will ask them to confirm the final settings before spending credits.`,
    {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async () => {
      // Best-effort: the static module catalog is always returned; the live
      // template rows, hooks, avatars and products are added when reachable so
      // the model can offer real picks.
      const [templates, hooks, avatars, products] = await Promise.all([
        fetchPublishedTemplates(),
        fetchHooks(12),
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
          "Present these options to the user and let them choose before calling seedance_generate. Do not silently apply defaults. Pass the chosen template's `module` AND `marketing_template_id`, and keep `duration` inside that template's duration_range (duration_range_with_hook when you attach a hook_id).",
        templates: {
          ...("items" in templates
            ? { items: templates.items }
            : { error: templates.error }),
          note: "Live published templates. `marketing_template_id` is what seedance_generate enforces hook + duration policy against; `module` is the generation style.",
        },
        modules: {
          items: VIDEO_AD_TEMPLATES,
          legacy: LEGACY_VIDEO_AD_TEMPLATES,
          direct: DIRECT_VIDEO_AD_TEMPLATE,
          note: "Module-level reference for the `module` enum, used when no published template row matches.",
        },
        parameters: videoAdParameterCatalog(),
        hooks: {
          ...("error" in hooks
            ? { error: hooks.error }
            : {
                presets: hooks.presets.map(summarizeHook),
                user: hooks.user.map(summarizeHook),
              }),
          note: "Optional opening hooks. Only hook_capable templates accept one; call list_video_ad_hooks to browse the full library.",
        },
        avatars: {
          ...avatars,
          note: 'Selectable presenter avatars. Required by templates with requires_avatar. Call avatar_search to browse more, or avatar_upload to add one; pass the chosen avatar as { url, id, type: "avatar" } in seedance_generate.image_url.',
        },
        products: {
          ...products,
          note: 'Product-library objects. Call product_parse_url or product_create to add one; pass its image URLs as { url, id, type: "product" } in seedance_generate.image_url.',
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
    `List the available Video Ad / Marketing Studio templates. Each entry's \`value\` is what you pass as \`module\` to \`seedance_generate\`; each live row also carries the \`marketing_template_id\` to pass alongside it.

Prefer \`plan_video_ad\` when the user is starting an ad — it returns the templates AND the parameter choices AND the hooks AND the user's avatars/products in one call. Use this tool when you only need the template list to confirm a \`module\` value the user already named.`,
    {
      published_only: z
        .boolean()
        .optional()
        .describe(
          "Default false. When true, return only the live published templates and omit the static module catalog.",
        ),
    },
    async ({ published_only }) => {
      const templates = await fetchPublishedTemplates();
      const payload = {
        ...("items" in templates
          ? { published: templates.items }
          : { published_error: templates.error }),
        ...(published_only
          ? {}
          : {
              modules: VIDEO_AD_TEMPLATES,
              legacy_modules: LEGACY_VIDEO_AD_TEMPLATES,
              direct: DIRECT_VIDEO_AD_TEMPLATE,
            }),
      };
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(payload, null, 2) },
        ],
      };
    },
  );

  server.tool(
    "list_video_ad_hooks",
    `List the opening hooks (Hooks Studio) that can be attached to a Video Ad. Pass a chosen entry's \`hook_id\` to \`seedance_generate\`.

A hook rewrites the ad's opening beat. It is optional, only \`hook_capable\` templates accept one, and a published template may allow only specific hooks — check the template's \`hook_policy\` and \`duration_range_with_hook\` from \`plan_video_ad\` before offering hooks to the user. Hook prompt bodies are server-side; you get the name, description and category to present.`,
    {
      category: z
        .string()
        .optional()
        .describe(
          "Optional preset category filter (recommended, high_interruption, trust_building, tutorial, ugc_natural).",
        ),
      limit: z
        .number()
        .int()
        .optional()
        .describe("Max hooks per group. Default 24."),
    },
    async ({ category, limit }) => {
      const pageSize = limit && limit > 0 ? Math.min(limit, 100) : 24;
      const params: Record<string, string> = {
        page: "1",
        page_size: String(pageSize),
      };
      if (category) params.category = category;
      const presets = await client
        .get<HookTemplateRow[]>("/public/hook-templates/presets", params)
        .catch((e: unknown) => ({ code: -1, msg: String(e), data: [] }));
      if (presets.code !== 0) {
        return {
          content: [{ type: "text" as const, text: formatApiError(presets) }],
          isError: true,
        };
      }
      const user = await client
        .get<HookTemplateRow[]>("/public/hook-templates/user/list", {
          page: "1",
          page_size: String(pageSize),
        })
        .catch(() => ({ code: -1, msg: "", data: [] }));
      const payload = {
        presets: (presets.data ?? []).map(summarizeHook),
        user: user.code === 0 ? (user.data ?? []).map(summarizeHook) : [],
        note: "Pass `hook_id` to seedance_generate. Hooks require a hook-capable module and a duration inside the template's duration_range_with_hook.",
      };
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(payload, null, 2) },
        ],
      };
    },
  );

  server.tool(
    "seedance_generate",
    `Generate a **Video Ad / Marketing Studio** video. Attach product/avatar references in \`image_url\`.

Call this only AFTER the user has chosen the template and parameters — run \`plan_video_ad\` first and let the user pick. Do not invent a \`module\`, \`ratio\`, \`duration\`, or \`resolution\` on the user's behalf; only apply defaults if the user explicitly said "you choose" / "use defaults". On clients that support it, this tool pops a confirmation form and the user must approve the final settings before any credits are spent (declining aborts the render).

Returns a \`task_id\` immediately; poll with \`get_seedance_task\`.

Allowed:
- model: "doubao-seedance-2-0-260128" (default) | "doubao-seedance-2-0-fast-260128" | "doubao-seedance-2-0-mini-260615" (Mini; 480p/720p only)
- resolution: "480p" | "720p" | "1080p" | "4k" | "1080P" (4k / 1080P are upscale tiers; 1080P requires the Standard model)
- ratio / input_ratio: "16:9" | "4:3" | "1:1" | "3:4" | "9:16" | "21:9" | "adaptive" (default 9:16)
- duration: 4-15 seconds (default 10), or -1 (auto) only when no \`marketing_template_id\` is set
- module: one of the 21 Marketing Studio templates, a legacy alias, or "Direct" (no template) — see \`plan_video_ad\`
- marketing_template_id: the published template row the user picked; the backend enforces its hook + duration policy
- hook_id: optional opening hook, hook-capable modules only — see \`list_video_ad_hooks\``,
    {
      prompt: z.string().describe("Generation prompt."),
      image_url: z
        .array(MEDIA_REF_SCHEMA)
        .optional()
        .describe(
          'Reference image(s). Plain URL strings, or { url, id?, type? } objects where `id` references an item from the user\'s material library and `type` marks the Marketing Studio role ("product" | "avatar"). Same shape the web Marketing Studio composer sends — keep the id and the role.',
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
        .describe(
          "Seconds. 4-15 (default 10). -1 (auto) is rejected when marketing_template_id is set; a template narrows the window further (see plan_video_ad duration_range).",
        ),
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
          "Output resolution. Default 720p. 4k and 1080P are upscale tiers (Marketing Studio only; 1080P requires the Standard model).",
        ),
      module: z
        .enum(MODULE_ENUM_VALUES)
        .optional()
        .describe(
          "Marketing Studio template style. Call plan_video_ad / list_video_ad_templates for descriptions. Default Direct (no template).",
        ),
      marketing_template_id: z
        .string()
        .optional()
        .describe(
          "Published template row id (mktpl_…) from plan_video_ad. Pass it whenever the user picked a template: the backend checks it matches `module` and enforces the template's hook + duration policy.",
        ),
      hook_id: z
        .string()
        .optional()
        .describe(
          "Optional opening-hook id (hookt_…) from list_video_ad_hooks. Only hook-capable modules accept one; the template's hook policy may restrict which hooks are allowed.",
        ),
      hook_selection_source: z
        .enum(HOOK_SELECTION_SOURCES)
        .optional()
        .describe(
          "Analytics-only hint for where the hook came from. Default marketing_studio when a hook_id is set.",
        ),
      project_id: z
        .string()
        .optional()
        .describe(
          "Optional marketing project to group this render under. Omit to let the API create one.",
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
      // A hook on a module that cannot take one is a guaranteed backend
      // rejection (HOOK_MODULE_NOT_SUPPORTED) — catch it before the gate so the
      // user isn't asked to confirm a render that cannot run.
      if (args.hook_id && args.module && !isHookCapableModule(args.module)) {
        return {
          content: [
            {
              type: "text" as const,
              text: `The "${args.module}" template does not support opening hooks. Drop \`hook_id\`, or pick a hook-capable template (see plan_video_ad \`hook_capable\`).`,
            },
          ],
          isError: true,
        };
      }

      // Duration window comes from the chosen published template, so the
      // confirmation form offers exactly what the backend will accept.
      let durationRange: DurationRange | undefined;
      let hookLabel: string | undefined;
      if (args.marketing_template_id) {
        const templates = await fetchPublishedTemplates();
        if ("items" in templates) {
          const picked = templates.items.find(
            (t) => t.marketing_template_id === args.marketing_template_id,
          );
          if (picked) {
            durationRange =
              (args.hook_id ? picked.duration_range_with_hook : null) ??
              picked.duration_range;
          }
        }
      }
      if (args.hook_id) {
        const hook = await client
          .get<HookTemplateRow>("/public/hook-templates", { id: args.hook_id })
          .catch(() => ({ code: -1, msg: "", data: undefined }));
        if (hook.code === 0 && hook.data?.name) hookLabel = hook.data.name;
      }

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
        hookLabel,
        durationRange,
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
        "marketing_template_id",
        "hook_id",
        "hook_selection_source",
        "project_id",
        "callback_url",
      ] as const) {
        const v = effective[k];
        if (v !== undefined) body[k] = v;
      }
      if (body.hook_id && body.hook_selection_source === undefined) {
        body.hook_selection_source = "marketing_studio";
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
    "Poll a Seedance task by ID. Returns status (pending/running/succeeded/failed), the template + hook it used, the public read-only share URL, and the result JSON when done.",
    { task_id: z.string() },
    async ({ task_id }) => {
      const resp = await client.get<{
        id: string;
        status: string;
        prompt: string;
        module?: string;
        module_type?: string;
        model?: string;
        ratio?: string;
        duration?: number;
        hook_id?: string;
        hook?: { name?: string };
        result?: Record<string, unknown>;
        error?: string;
        failure_reason?: string;
        charged_cost?: number;
        credit_cost?: number;
        needs_topaz_upscale?: boolean;
      }>("/public/project/seedance/task", { task_id });
      if (resp.code !== 0 || !resp.data) {
        return {
          content: [{ type: "text" as const, text: formatApiError(resp) }],
          isError: true,
        };
      }
      const d = resp.data;
      const lines = [`Status: ${d.status}`, `Task ID: \`${d.id}\``];
      if (d.module) lines.push(`Template: ${d.module}`);
      if (d.hook?.name || d.hook_id)
        lines.push(`Hook: ${d.hook?.name ?? d.hook_id}`);
      lines.push(`Share: ${seedanceShareUrl(webUrl, d.id)}`);
      if (d.error) lines.push(`Error: ${d.error}`);
      if (d.failure_reason) lines.push(`Failure reason: ${d.failure_reason}`);
      if (d.needs_topaz_upscale) lines.push("Upscale: pending (Topaz)");
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
    "List the user's Seedance / Marketing Studio task history (paginated; optional status, project, and hook filters).",
    {
      page: z.number().int().optional(),
      page_size: z.number().int().optional(),
      status: z.enum(["pending", "running", "succeeded", "failed"]).optional(),
      project_id: z
        .string()
        .optional()
        .describe("Only tasks in this marketing project."),
      hooks_only: z
        .boolean()
        .optional()
        .describe("Only tasks that were generated with an opening hook."),
    },
    async ({ page, page_size, status, project_id, hooks_only }) => {
      const params: Record<string, string> = {
        module_type: "marketing_studio",
      };
      if (page) params.page = String(page);
      if (page_size) params.page_size = String(page_size);
      if (status) params.status = status;
      if (project_id) params.project_id = project_id;
      if (hooks_only) params.hooks_only = "true";
      const resp = await client.get<
        Array<{
          id: string;
          status: string;
          prompt: string;
          model?: string;
          module?: string;
          ratio?: string;
          duration?: number;
          hook_id?: string;
          hook?: { name?: string };
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
        "| ID | Status | Share | Template | Hook | Ratio | Duration | Cost | Prompt |",
        "|---|---|---|---|---|---|---|---|---|",
      ];
      for (const it of items) {
        const promptPreview = (it.prompt ?? "")
          .replace(/\n/g, " ")
          .slice(0, 60);
        const hook = it.hook?.name ?? (it.hook_id ? "yes" : "—");
        lines.push(
          `| \`${it.id}\` | ${it.status} | [Link](${seedanceShareUrl(webUrl, it.id)}) | ${it.module ?? "—"} | ${hook} | ${it.ratio ?? "—"} | ${it.duration ?? "—"}s | ${it.charged_cost ?? 0} | ${promptPreview} |`,
        );
      }
      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    },
  );
}
