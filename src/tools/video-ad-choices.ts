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
// `value` fields mirror the backend `seedanceAllowedModules` enum and the
// seedance_generate zod enums exactly — keep them in sync.
// ---------------------------------------------------------------------------

export interface VideoAdTemplate {
  value: string;
  name: string;
  description: string;
}

// 9 user-facing templates + the implicit "Direct" fallback.
export const VIDEO_AD_TEMPLATES: VideoAdTemplate[] = [
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
    description: "Default quality tier.",
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

export const PARAM_DEFAULTS = {
  module: "Direct",
  ratio: "9:16",
  duration: 10,
  resolution: "720p",
  model: "doubao-seedance-2-0-260128",
} as const;

/** The catalog a caller should present to the user before generating. */
export function videoAdParameterCatalog() {
  return {
    module: {
      title: "Ad template",
      options: VIDEO_AD_TEMPLATES,
      default: PARAM_DEFAULTS.module,
    },
    ratio: {
      title: "Aspect ratio",
      options: [...RATIO_OPTIONS],
      default: PARAM_DEFAULTS.ratio,
    },
    duration: {
      title: "Duration (seconds)",
      note: "-1 for auto, or 4–15.",
      default: PARAM_DEFAULTS.duration,
    },
    resolution: {
      title: "Resolution",
      options: [...RESOLUTION_OPTIONS],
      default: PARAM_DEFAULTS.resolution,
      note: "4k / 1080P are upscale tiers (1080P requires Seedance 2.0).",
    },
    model: {
      title: "Model tier",
      options: MODEL_OPTIONS,
      default: PARAM_DEFAULTS.model,
    },
    language: {
      title: "Spoken language",
      note: "Auto-detected from your prompt/product text. State a language explicitly (e.g. 'English voiceover') to override.",
    },
  };
}

export interface ProposedChoices {
  module?: string;
  ratio?: string;
  duration?: number;
  resolution?: string;
  model?: string;
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

  let result: Awaited<ReturnType<typeof server.server.elicitInput>>;
  try {
    result = await server.server.elicitInput({
      mode: "form",
      message:
        "Confirm your Video Ad settings before rendering — this spends credits. Edit anything you'd like to change.",
      requestedSchema: {
        type: "object",
        properties: {
          module: {
            type: "string",
            title: "Ad template",
            description: "Marketing Studio format.",
            enum: VIDEO_AD_TEMPLATES.map((t) => t.value),
            enumNames: VIDEO_AD_TEMPLATES.map((t) => t.name),
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
            description: "-1 for auto, or 4–15.",
            default: proposed.duration ?? PARAM_DEFAULTS.duration,
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
