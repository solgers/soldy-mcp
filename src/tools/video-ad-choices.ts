import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// ---------------------------------------------------------------------------
// Shared Video Ad / Marketing Studio option catalog + the elicitation gate.
//
// The point of this module is user-first choice: seedance_generate must NOT
// silently render on defaults. `plan_video_ad` (marketing.ts) surfaces the
// full catalog for the model to present, and `confirmVideoAdChoices` blocks a
// credit-spending render behind an explicit user confirmation on clients that
// support MCP elicitation.
//
// Backend sources of truth — keep in sync:
//   modules + legacy aliases  services/api/internal/models/marketing_studio_module.go
//   hook-capable modules      services/api/internal/models/hook_capable_module.go
//   request enums / limits    services/api/internal/transport/rest/project/seedance_direct.go
//   avatar-required map       services/web/lib/generator/marketing-studio-template-mapper.ts
// The names/descriptions mirror the published template rows seeded in
// services/api/internal/devseed/marketing_templates.json. The live, published
// catalog is fetched at runtime by `plan_video_ad` from
// GET /public/marketing/templates — this static list is the module-level
// reference and the offline fallback. The smoke test asserts drift.
// ---------------------------------------------------------------------------

export type VideoAdCategory = "ugc" | "commercial" | "none";

/**
 * Every value `module` accepts on POST /public/project/seedance/generate for
 * the Marketing Studio path: the 21 MS2 modules, the 5 legacy aliases, and the
 * no-template `Direct` fallback. Mirrors `seedanceAllowedModules` minus the
 * Recast Studio (`Recast_*`) values, which the MCP does not expose.
 *
 * This tuple types the catalog below, so a template whose `value` is not listed
 * here is a compile error.
 */
export const MODULE_ENUM_VALUES = [
  "UGC",
  "UGC_Try_On",
  "Unboxing_ASMR",
  "This_Saved_Me",
  "Product_First",
  "Close_Up_Detail_Proof",
  "Show_The_Texture",
  "UGC_Showing_Product",
  "Routine_Insert",
  "Direct_To_Camera",
  "Giant_Figure",
  "Try_It_On_Face",
  "Show_How_It_Works",
  "Unboxing",
  "Hyper_Motion",
  "Before_After",
  "Sneakers_Try_On",
  "Model_Pro_Try_On",
  "TV_Spot",
  "Wild_Concept",
  "Testimonial",
  "Tutorial",
  "Product_Review",
  "Wild_Card",
  "UGC_Virtual_Try_On",
  "Pro_Virtual_Try_On",
  "Direct",
] as const;

export type VideoAdModule = (typeof MODULE_ENUM_VALUES)[number];

export interface VideoAdTemplate {
  /** Module value passed as `module` to seedance_generate. */
  value: VideoAdModule;
  name: string;
  description: string;
  /** Preset wall grouping on the web composer. */
  category: VideoAdCategory;
  /** Template needs a presenter avatar reference in image_url. */
  requiresAvatar: boolean;
  /** Module accepts `hook_id` on generate. */
  hookCapable: boolean;
  /** Superseded alias kept for older clients / persisted tasks. */
  legacy?: true;
}

/** The 21 Marketing Studio (MS2) modules, in backend enum order. */
export const VIDEO_AD_TEMPLATES: VideoAdTemplate[] = [
  {
    value: "UGC",
    name: "UGC",
    description: "Authentic creator-style content.",
    category: "ugc",
    requiresAvatar: true,
    hookCapable: true,
  },
  {
    value: "UGC_Try_On",
    name: "UGC Try On",
    description: "Casual creator trying on the product.",
    category: "ugc",
    requiresAvatar: true,
    hookCapable: true,
  },
  {
    value: "Unboxing_ASMR",
    name: "Unboxing ASMR",
    description: "Satisfying unboxing with immersive sound.",
    category: "ugc",
    requiresAvatar: true,
    hookCapable: true,
  },
  {
    value: "This_Saved_Me",
    name: "This Saved Me",
    description: "Turn product benefits into a personal success story.",
    category: "ugc",
    requiresAvatar: true,
    hookCapable: false,
  },
  {
    value: "Product_First",
    name: "Product In Use",
    description: "Products naturally used in everyday moments.",
    category: "commercial",
    requiresAvatar: false,
    hookCapable: false,
  },
  {
    value: "Close_Up_Detail_Proof",
    name: "Close-Up-Detail Proof",
    description: "Close-up product details that build confidence.",
    category: "commercial",
    requiresAvatar: false,
    hookCapable: false,
  },
  {
    value: "Show_The_Texture",
    name: "Show the Texture",
    description: "Close-up texture and finish reveal.",
    category: "commercial",
    requiresAvatar: false,
    hookCapable: false,
  },
  {
    value: "UGC_Showing_Product",
    name: "UGC Showing Product",
    description: "Creator-style product videos.",
    category: "ugc",
    requiresAvatar: true,
    hookCapable: true,
  },
  {
    value: "Routine_Insert",
    name: "Routine Insert",
    description: "Products blended into everyday routines.",
    category: "ugc",
    requiresAvatar: true,
    hookCapable: true,
  },
  {
    value: "Direct_To_Camera",
    name: "Direct to Camera",
    description: "Creator speaking straight to camera.",
    category: "ugc",
    requiresAvatar: true,
    hookCapable: true,
  },
  {
    value: "Giant_Figure",
    name: "Giant Figure",
    description: "Oversized, scroll-stopping product moments.",
    category: "ugc",
    requiresAvatar: true,
    hookCapable: true,
  },
  {
    value: "Try_It_On_Face",
    name: "Try It On Face",
    description: "Products previewed directly on the face.",
    category: "ugc",
    requiresAvatar: true,
    hookCapable: true,
  },
  {
    value: "Show_How_It_Works",
    name: "Show How It Works",
    description: "Step-by-step product demonstration.",
    category: "ugc",
    requiresAvatar: true,
    hookCapable: false,
  },
  {
    value: "Unboxing",
    name: "Unboxing",
    description: "Exciting product reveal through unboxing.",
    category: "ugc",
    requiresAvatar: true,
    hookCapable: true,
  },
  {
    value: "Hyper_Motion",
    name: "Hyper Motion",
    description: "High-energy product motion bursts.",
    category: "commercial",
    requiresAvatar: false,
    hookCapable: true,
  },
  {
    value: "Before_After",
    name: "Before & After",
    description: "Visible transformation before and after use.",
    category: "ugc",
    requiresAvatar: true,
    hookCapable: false,
  },
  {
    value: "Sneakers_Try_On",
    name: "Sneakers Try-On",
    description: "Sneakers showcased naturally on feet.",
    category: "ugc",
    requiresAvatar: true,
    hookCapable: true,
  },
  {
    value: "Model_Pro_Try_On",
    name: "Model Pro Try-On",
    description: "Professional model showcasing the product.",
    category: "commercial",
    requiresAvatar: true,
    hookCapable: true,
  },
  {
    value: "TV_Spot",
    name: "TV Spot / Premium Commercial",
    description: "Cinematic brand-style commercials.",
    category: "commercial",
    requiresAvatar: true,
    hookCapable: true,
  },
  {
    value: "Wild_Concept",
    name: "Wild Concept",
    description: "Turn bold ideas into impossible product ads.",
    category: "commercial",
    requiresAvatar: false,
    hookCapable: true,
  },
  {
    value: "Testimonial",
    name: "Testimonial",
    description: "Customer-style testimonial delivered to camera.",
    category: "ugc",
    requiresAvatar: true,
    hookCapable: true,
  },
];

/**
 * Pre-MS2 module values the backend still accepts. They map onto the modern
 * templates above; prefer a current module for new renders, and keep these for
 * re-running a task that already carries one.
 */
export const LEGACY_VIDEO_AD_TEMPLATES: VideoAdTemplate[] = [
  {
    value: "Tutorial",
    name: "Tutorial (legacy)",
    description: "Step-by-step tutorials. Superseded by Show How It Works.",
    category: "ugc",
    requiresAvatar: true,
    hookCapable: true,
    legacy: true,
  },
  {
    value: "Product_Review",
    name: "Product Review (legacy)",
    description: "Authentic product review. Superseded by Testimonial.",
    category: "ugc",
    requiresAvatar: true,
    hookCapable: true,
    legacy: true,
  },
  {
    value: "Wild_Card",
    name: "Wild Card (legacy)",
    description: "Custom creative ideas. Superseded by Wild Concept.",
    category: "commercial",
    requiresAvatar: false,
    hookCapable: false,
    legacy: true,
  },
  {
    value: "UGC_Virtual_Try_On",
    name: "UGC Virtual Try On (legacy)",
    description: "Try-before-you-buy in UGC style. Superseded by UGC Try On.",
    category: "ugc",
    requiresAvatar: true,
    hookCapable: true,
    legacy: true,
  },
  {
    value: "Pro_Virtual_Try_On",
    name: "Pro Virtual Try On (legacy)",
    description: "Polished virtual try-on. Superseded by Model Pro Try-On.",
    category: "commercial",
    requiresAvatar: true,
    hookCapable: false,
    legacy: true,
  },
];

/** No-template fallback: generation runs from prompt + media only. */
export const DIRECT_VIDEO_AD_TEMPLATE: VideoAdTemplate = {
  value: "Direct",
  name: "Direct",
  description:
    "Default fallback (no template). Generation runs from your prompt + media without a Marketing Studio preset.",
  category: "none",
  requiresAvatar: false,
  hookCapable: false,
};

/** Everything `module` accepts on the Marketing Studio path. */
export const ALL_VIDEO_AD_TEMPLATES: VideoAdTemplate[] = [
  ...VIDEO_AD_TEMPLATES,
  ...LEGACY_VIDEO_AD_TEMPLATES,
  DIRECT_VIDEO_AD_TEMPLATE,
];

export const MODULE_VALUES: VideoAdModule[] = ALL_VIDEO_AD_TEMPLATES.map(
  (t) => t.value,
);

/** Module values offered in the confirmation form (current templates only). */
export const SELECTABLE_MODULE_VALUES: VideoAdModule[] = [
  ...VIDEO_AD_TEMPLATES.map((t) => t.value),
  DIRECT_VIDEO_AD_TEMPLATE.value,
];

export function findVideoAdTemplate(
  value: string | undefined,
): VideoAdTemplate | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return ALL_VIDEO_AD_TEMPLATES.find((t) => t.value === trimmed);
}

export function isHookCapableModule(value: string | undefined): boolean {
  return findVideoAdTemplate(value)?.hookCapable === true;
}

export const RATIO_OPTIONS = [
  "16:9",
  "4:3",
  "1:1",
  "3:4",
  "9:16",
  "21:9",
  "adaptive",
] as const;

export const RESOLUTION_OPTIONS = [
  "480p",
  "720p",
  "1080p",
  "4k",
  "1080P",
] as const;

export interface ModelOption {
  value: string;
  name: string;
  description: string;
}

export const MODEL_OPTIONS: ModelOption[] = [
  {
    value: "doubao-seedance-2-0-260128",
    name: "Standard",
    description: "Default quality tier. Required for the 1080P upscale tier.",
  },
  {
    value: "doubao-seedance-2-0-fast-260128",
    name: "Fast",
    description: "Faster render, lighter compute.",
  },
  {
    value: "doubao-seedance-2-0-mini-260615",
    name: "Mini",
    description: "Lowest cost; 480p/720p only.",
  },
];

// Duration bounds mirror models.MarketingTemplate* constants.
export const DURATION_MIN_SECONDS = 4;
export const DURATION_MAX_SECONDS = 15;
/** Floor for templates whose hook_config mode is "disabled". */
export const DURATION_HOOK_DISABLED_MIN_SECONDS = 8;
/** Floor once a hook is attached (hook_config mode "inherit"/"allowlist"). */
export const DURATION_WITH_HOOK_MIN_SECONDS = 5;

export const HOOK_SELECTION_SOURCES = [
  "marketing_studio",
  "hooks_studio",
  "landing",
  "share",
] as const;

export const PARAM_DEFAULTS = {
  module: "Direct",
  ratio: "9:16",
  duration: 10,
  resolution: "720p",
  model: "doubao-seedance-2-0-260128",
} as const;

export interface DurationRange {
  minSeconds: number;
  maxSeconds: number;
}

/** The catalog a caller should present to the user before generating. */
export function videoAdParameterCatalog() {
  return {
    module: {
      title: "Ad template",
      options: VIDEO_AD_TEMPLATES,
      legacy_options: LEGACY_VIDEO_AD_TEMPLATES,
      direct: DIRECT_VIDEO_AD_TEMPLATE,
      default: PARAM_DEFAULTS.module,
      note: "`requiresAvatar` templates need a presenter avatar in image_url; `hookCapable` templates accept a hook_id.",
    },
    ratio: {
      title: "Aspect ratio",
      options: [...RATIO_OPTIONS],
      default: PARAM_DEFAULTS.ratio,
    },
    duration: {
      title: "Duration (seconds)",
      default: PARAM_DEFAULTS.duration,
      min: DURATION_MIN_SECONDS,
      max: DURATION_MAX_SECONDS,
      note: `${DURATION_MIN_SECONDS}–${DURATION_MAX_SECONDS}. A published template narrows this: hook-disabled templates start at ${DURATION_HOOK_DISABLED_MIN_SECONDS}s, and attaching a hook starts at ${DURATION_WITH_HOOK_MIN_SECONDS}s. Use the per-template duration range returned by plan_video_ad. -1 (auto) is rejected when marketing_template_id is set.`,
    },
    resolution: {
      title: "Resolution",
      options: [...RESOLUTION_OPTIONS],
      default: PARAM_DEFAULTS.resolution,
      note: "4k / 1080P are upscale tiers; 1080P requires the Standard model.",
    },
    model: {
      title: "Model tier",
      options: MODEL_OPTIONS,
      default: PARAM_DEFAULTS.model,
    },
    hook: {
      title: "Opening hook",
      note: "Optional. Hooks come from Hooks Studio — list them with list_video_ad_hooks and pass the chosen `hook_id`. Only hookCapable modules accept one, and a published template may disable hooks or allow only specific ones.",
    },
    language: {
      title: "Spoken language",
      note: "Auto-detected from your prompt/product text. State a language explicitly (e.g. 'English voiceover') to override.",
    },
  };
}

/**
 * Duration window the backend will accept for a published template, mirroring
 * validateMarketingTemplateHookConfig. `hookConfig` is the template row's
 * `hook_config`; `withHook` is whether a hook_id will be attached.
 */
export function templateDurationRange(
  hookConfig: unknown,
  withHook: boolean,
): DurationRange {
  const config =
    hookConfig && typeof hookConfig === "object"
      ? (hookConfig as Record<string, unknown>)
      : {};
  const mode =
    typeof config.mode === "string" && config.mode.trim().length > 0
      ? config.mode.trim()
      : "inherit";
  const num = (key: string): number | undefined =>
    typeof config[key] === "number" ? (config[key] as number) : undefined;

  if (!withHook || mode === "disabled") {
    return clampRange({
      minSeconds:
        num("default_min_seconds") ||
        (mode === "disabled"
          ? DURATION_HOOK_DISABLED_MIN_SECONDS
          : DURATION_MIN_SECONDS),
      maxSeconds: num("default_max_seconds") || DURATION_MAX_SECONDS,
    });
  }
  return clampRange({
    minSeconds: num("hook_min_seconds") || DURATION_WITH_HOOK_MIN_SECONDS,
    maxSeconds: num("hook_max_seconds") || DURATION_MAX_SECONDS,
  });
}

function clampRange(range: DurationRange): DurationRange {
  return {
    minSeconds: Math.max(DURATION_MIN_SECONDS, range.minSeconds),
    maxSeconds: Math.min(DURATION_MAX_SECONDS, range.maxSeconds),
  };
}

export interface ProposedChoices {
  module?: string;
  ratio?: string;
  duration?: number;
  resolution?: string;
  model?: string;
  /** Human-readable hook name, shown in the confirmation message only. */
  hookLabel?: string;
  /** Template-narrowed duration window, when a marketing_template_id is set. */
  durationRange?: DurationRange;
}

export interface ConfirmedChoices {
  module?: string;
  ratio?: string;
  duration?: number;
  resolution?: string;
  model?: string;
}

export type ConfirmResult =
  | { status: "accepted"; values: ConfirmedChoices }
  | { status: "declined" }
  | { status: "cancelled" }
  | { status: "unsupported" };

/**
 * Hard-gate a Video Ad render behind explicit user confirmation.
 *
 * When the connected MCP client advertises the `elicitation` capability, this
 * pops a confirmation form pre-filled with the proposed (or default) settings;
 * the user must accept before any credits are spent, and may edit any field.
 * When the client does not support elicitation, it returns `unsupported` and
 * the caller falls back to the options-first prompt guidance.
 */
export async function confirmVideoAdChoices(
  server: McpServer,
  proposed: ProposedChoices,
): Promise<ConfirmResult> {
  const caps = server.server.getClientCapabilities();
  if (!caps?.elicitation) return { status: "unsupported" };

  const range = proposed.durationRange ?? {
    minSeconds: DURATION_MIN_SECONDS,
    maxSeconds: DURATION_MAX_SECONDS,
  };
  // A module the user already chose stays offered even when it's a legacy
  // alias, so the form never silently drops their pick.
  const selectable: string[] = [...SELECTABLE_MODULE_VALUES];
  const proposedModule = proposed.module?.trim() ?? "";
  const moduleValues =
    proposedModule && !selectable.includes(proposedModule)
      ? [...selectable, proposedModule]
      : selectable;
  const moduleNames = moduleValues.map(
    (value) => findVideoAdTemplate(value)?.name ?? value,
  );

  let result: Awaited<ReturnType<typeof server.server.elicitInput>>;
  try {
    result = await server.server.elicitInput({
      mode: "form",
      message: [
        "Confirm your Video Ad settings before rendering — this spends credits. Edit anything you'd like to change.",
        proposed.hookLabel ? `Opening hook: ${proposed.hookLabel}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      requestedSchema: {
        type: "object",
        properties: {
          module: {
            type: "string",
            title: "Ad template",
            description: "Marketing Studio format.",
            enum: moduleValues,
            enumNames: moduleNames,
            default: proposed.module ?? PARAM_DEFAULTS.module,
          },
          ratio: {
            type: "string",
            title: "Aspect ratio",
            enum: [...RATIO_OPTIONS],
            default: proposed.ratio ?? PARAM_DEFAULTS.ratio,
          },
          duration: {
            type: "integer",
            title: "Duration (seconds)",
            description: `${range.minSeconds}–${range.maxSeconds} for this template.`,
            minimum: range.minSeconds,
            maximum: range.maxSeconds,
            default: clampDuration(
              proposed.duration ?? PARAM_DEFAULTS.duration,
              range,
            ),
          },
          resolution: {
            type: "string",
            title: "Resolution",
            description: "4k / 1080P are upscale tiers.",
            enum: [...RESOLUTION_OPTIONS],
            default: proposed.resolution ?? PARAM_DEFAULTS.resolution,
          },
          model: {
            type: "string",
            title: "Model tier",
            enum: MODEL_OPTIONS.map((m) => m.value),
            enumNames: MODEL_OPTIONS.map((m) => m.name),
            default: proposed.model ?? PARAM_DEFAULTS.model,
          },
        },
        required: ["module", "ratio", "duration", "resolution"],
      },
    });
  } catch {
    // Client mis-declared support or errored — degrade to prompt guidance
    // rather than blocking a legitimate render on an infra hiccup.
    return { status: "unsupported" };
  }

  if (result.action === "decline") return { status: "declined" };
  if (result.action !== "accept") return { status: "cancelled" };

  const c = result.content ?? {};
  const values: ConfirmedChoices = {};
  if (typeof c.module === "string") values.module = c.module;
  if (typeof c.ratio === "string") values.ratio = c.ratio;
  if (typeof c.duration === "number") values.duration = c.duration;
  if (typeof c.resolution === "string") values.resolution = c.resolution;
  if (typeof c.model === "string") values.model = c.model;
  return { status: "accepted", values };
}

function clampDuration(duration: number, range: DurationRange): number {
  if (duration < 0) return range.minSeconds;
  return Math.min(range.maxSeconds, Math.max(range.minSeconds, duration));
}
