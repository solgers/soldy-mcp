import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SoldyAPIClient } from "../client.js";
import type { ChatResult, ConnectionManager } from "../connection.js";
import { formatApiError } from "../errors.js";
import { resolveUrls } from "../files.js";

interface SendMessageResp {
  message_id: string;
  status: string;
}

export function registerChatTools(
  server: McpServer,
  client: SoldyAPIClient,
  connection: ConnectionManager,
) {
  server.tool(
    "chat",
    `Send a message to the project agent and wait for the complete response.

This is the primary way to interact with Soldy. It sends your message, waits for the agent to finish processing, and returns the full response including all messages, tool calls, and generated materials.

The call blocks until the agent run completes, pauses, is cancelled, errors, or times out (default 5 minutes). For long-running generations, use a higher timeout_seconds.

Required: ratio — the video aspect ratio. Choose based on target platform:
- 9:16 → TikTok, Reels, Shorts (vertical)
- 16:9 → YouTube, landscape video
- 1:1 → Instagram, square
- 4:3, 3:4, 3:2, 2:3, 21:9 → other formats

Optional advanced routing:
- workflow — pin the agent to a specific workflow (brand_dna, product, character, visual_hooks, product_highlights, story_creative, campaign_planning).
- entry_template_id — Image/Video home card id (e.g. "storyboard-grid") used when launching a Showcase from the homepage.
- creative_brief — structured brief from the brief wizard. Map of strings; common keys: duration, delivery, ratio, narrative_style, visual_style, music_mood, workflow, platform, pacing.
- should_remind — set false to skip large-consumption confirmations on this run (default true).
- large_consume_agreed — set true to pre-acknowledge large-consumption cost so the agent does not pause for it.

If the response status is "paused", the agent is waiting for user input (e.g., credits, approval). Show the pause reason / cost / tool_name to the user, then call continue_project when ready.

If the response status is "cancelled", the run was stopped by user/system; no further action is needed.

If the response status is "timeout", generation is still running. Use get_updates with the returned cursor to check for new results.`,
    {
      project_id: z.string(),
      message: z
        .string()
        .describe("Message to the agent describing what to generate or modify"),
      ratio: z
        .enum(["9:16", "16:9", "1:1", "4:3", "3:4", "3:2", "2:3", "21:9"])
        .describe("Video aspect ratio (required)"),
      material_urls: z
        .array(z.string())
        .optional()
        .describe("Image/video/audio URLs or local file paths"),
      brand_id: z
        .string()
        .optional()
        .describe("Brand ID for generation context"),
      input_mode: z
        .enum(["agent", "seedance"])
        .optional()
        .describe(
          "'agent' (default) runs full production pipeline. 'seedance' uses Seedance 2.0 direct video generation — requires seedance_reference_url.",
        ),
      seedance_reference_url: z
        .string()
        .optional()
        .describe("Reference image for Seedance 2.0 mode"),
      workflow: z
        .enum([
          "brand_dna",
          "product",
          "character",
          "visual_hooks",
          "product_highlights",
          "story_creative",
          "campaign_planning",
        ])
        .optional()
        .describe("Pin the agent to a specific workflow track"),
      entry_template_id: z
        .string()
        .optional()
        .describe(
          "Showcase entry-template id (e.g. 'storyboard-grid'); routes the agent to showcase creation",
        ),
      creative_brief: z
        .record(z.string(), z.string())
        .optional()
        .describe(
          "Structured brief from the brief wizard (duration, delivery, narrative_style, visual_style, music_mood, platform, pacing, etc.)",
        ),
      should_remind: z
        .boolean()
        .optional()
        .describe("Set false to skip large-consumption reminders for this run"),
      large_consume_agreed: z
        .boolean()
        .optional()
        .describe(
          "Set true to pre-acknowledge the large-consumption cost so the agent does not pause",
        ),
      timeout_seconds: z
        .number()
        .optional()
        .describe("Max wait time in seconds (default 300)"),
    },
    async ({
      project_id,
      message,
      ratio,
      material_urls,
      brand_id,
      input_mode,
      seedance_reference_url,
      workflow,
      entry_template_id,
      creative_brief,
      should_remind,
      large_consume_agreed,
      timeout_seconds,
    }) => {
      // Validate seedance mode
      if (input_mode === "seedance" && !seedance_reference_url?.trim()) {
        return {
          content: [
            {
              type: "text" as const,
              text: "seedance_reference_url is required when input_mode='seedance'.",
            },
          ],
          isError: true,
        };
      }

      // Resolve file URLs
      let resolvedUrls: string[] | undefined;
      if (material_urls?.length) {
        try {
          resolvedUrls = await resolveUrls(client, material_urls);
        } catch (err) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Failed to process materials: ${err instanceof Error ? err.message : String(err)}`,
              },
            ],
            isError: true,
          };
        }
      }

      let resolvedSeedanceRef: string | undefined;
      if (seedance_reference_url?.trim()) {
        try {
          const [u] = await resolveUrls(client, [
            seedance_reference_url.trim(),
          ]);
          resolvedSeedanceRef = u;
        } catch (err) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Failed to process seedance_reference_url: ${err instanceof Error ? err.message : String(err)}`,
              },
            ],
            isError: true,
          };
        }
      }

      // Send message via HTTP
      const options: Record<string, unknown> = { ratio };
      if (brand_id) options.brand_id = brand_id;
      if (input_mode) options.input_mode = input_mode;
      if (resolvedSeedanceRef)
        options.seedance_reference_url = resolvedSeedanceRef;
      if (workflow) options.workflow = workflow;
      if (entry_template_id) options.entry_template_id = entry_template_id;
      if (creative_brief && Object.keys(creative_brief).length > 0)
        options.creative_brief = creative_brief;
      if (should_remind !== undefined) options.should_remind = should_remind;
      if (large_consume_agreed !== undefined)
        options.large_consume_agreed = large_consume_agreed;

      const body: Record<string, unknown> = {
        project_id,
        content: message,
        options,
      };
      if (resolvedUrls?.length) body.material_urls = resolvedUrls;

      const resp = await client.post<SendMessageResp>(
        "/public/project/message/send",
        body,
      );
      if (resp.code !== 0 || !resp.data) {
        return {
          content: [{ type: "text" as const, text: formatApiError(resp) }],
          isError: true,
        };
      }

      // Wait for agent response via WebSocket
      const timeoutMs = (timeout_seconds ?? 300) * 1000;

      let result: ChatResult;
      try {
        result = await connection.waitForRunCompletion(project_id, {
          timeoutMs,
        });
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to connect for real-time updates: ${err instanceof Error ? err.message : String(err)}\nMessage was sent successfully. Use get_updates(project_id) to check for results.`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: formatChatResult(result),
          },
        ],
      };
    },
  );
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

interface UserChoiceOption {
  id?: string;
  label?: string;
  title?: string;
  description?: string;
  preview_url?: string;
}

interface UserChoiceOutput {
  key?: string;
  title?: string;
  prompt?: string;
  options?: UserChoiceOption[];
  recommended_id?: string;
}

function isUserChoiceTool(name: string): boolean {
  return name === "user_choice_prompt" || name.endsWith("_user_choice");
}

function asUserChoiceOutput(
  output: Record<string, unknown> | undefined,
): UserChoiceOutput | null {
  if (!output) return null;
  const opts = output.options;
  if (!Array.isArray(opts)) return null;
  return output as UserChoiceOutput;
}

function renderUserChoice(uc: UserChoiceOutput): string {
  const header = uc.title ?? uc.prompt ?? "Soldy is asking you to pick";
  const lines = [`  ❓ ${header}${uc.key ? `  (key: ${uc.key})` : ""}`];
  for (const [i, opt] of (uc.options ?? []).entries()) {
    const marker =
      opt.id && opt.id === uc.recommended_id ? " ⭐ recommended" : "";
    const label = opt.label ?? opt.title ?? opt.id ?? `option ${i + 1}`;
    lines.push(`     ${i + 1}. ${label}${marker}`);
    if (opt.description) lines.push(`        ${opt.description}`);
    if (opt.preview_url) lines.push(`        preview: ${opt.preview_url}`);
  }
  return lines.join("\n");
}

function extractRejectedFix(
  output: Record<string, unknown> | undefined,
): { error: string; fix?: string } | null {
  if (!output) return null;
  const err = output.error;
  if (typeof err !== "string" || err.trim() === "") return null;
  const fix = typeof output.fix === "string" ? output.fix : undefined;
  return { error: err, fix };
}

const REASONING_EVENTS = new Set([
  "ReasoningStarted",
  "ReasoningStep",
  "ReasoningCompleted",
  "TeamReasoningStarted",
  "TeamReasoningStep",
  "TeamReasoningCompleted",
]);

function formatPauseToolName(tn: string | string[] | undefined): string | null {
  if (!tn) return null;
  if (Array.isArray(tn)) {
    return tn.length > 0 ? tn.join(", ") : null;
  }
  return tn.trim() === "" ? null : tn;
}

function formatChatResult(result: ChatResult): string {
  const lines: string[] = [];

  // Status header
  const statusLabel: Record<string, string> = {
    completed: "completed",
    paused: "paused",
    cancelled: "cancelled",
    error: "error",
    timeout: "timeout",
  };
  lines.push(
    `Status: ${statusLabel[result.status] ?? result.status} (${result.elapsed_seconds}s)`,
  );
  if (result.run_id) lines.push(`Run: ${result.run_id}`);
  lines.push("");

  // Track flags surfaced from tool outputs
  let sawUserChoice = false;
  const reasoningSteps: string[] = [];

  // Agent messages
  if (result.messages.length > 0) {
    for (const msg of result.messages) {
      if (REASONING_EVENTS.has(msg.event)) {
        // Fold reasoning events into a single block at the end of this section.
        if (msg.content && msg.content.trim() !== "") {
          reasoningSteps.push(msg.content.trim());
        }
        continue;
      }

      if (msg.tool) {
        lines.push(
          `[tool: ${msg.tool.name}${msg.tool.state ? ` (${msg.tool.state})` : ""}]`,
        );
        if (msg.content) lines.push(`  ${msg.content}`);

        // user_choice_prompt → render the choice card
        if (isUserChoiceTool(msg.tool.name)) {
          const uc = asUserChoiceOutput(msg.tool.output);
          if (uc) {
            sawUserChoice = true;
            lines.push(renderUserChoice(uc));
          }
        }

        // Image tool with structured rejection → show fix hint
        const rej = extractRejectedFix(msg.tool.output);
        if (rej) {
          lines.push(`  ✗ rejected: ${rej.error}`);
          if (rej.fix) lines.push(`    suggested fix: ${rej.fix}`);
        }
      } else if (msg.content) {
        const prefix = msg.role === "user" ? "[you]" : "[agent]";
        lines.push(`${prefix} ${msg.content}`);
      }
      if (msg.materials?.length) {
        for (const m of msg.materials) {
          lines.push(`  [${m.type}] ${m.url}`);
        }
      }
    }

    if (reasoningSteps.length > 0) {
      lines.push("[reasoning]");
      for (const step of reasoningSteps) {
        lines.push(`  • ${step}`);
      }
    }

    lines.push("");
  }

  // Materials summary
  if (result.materials.length > 0) {
    lines.push(`Materials (${result.materials.length}):`);
    for (let i = 0; i < result.materials.length; i++) {
      const m = result.materials[i];
      let line = `  ${i + 1}. [${m.type}] ${m.url}`;
      if (m.display_title) line += ` — ${m.display_title}`;
      lines.push(line);
    }
    lines.push("");
  }

  // Status-specific messages
  if (result.status === "paused") {
    if (sawUserChoice) {
      lines.push(
        "Paused awaiting user choice. Surface the options above to the user, then call continue_project (the agent picks up the choice from the conversation).",
      );
    } else if (result.pause_reason) {
      lines.push(`Pause reason: ${result.pause_reason}`);
    } else {
      lines.push("Paused.");
    }
    if (result.pause_cost !== undefined) {
      lines.push(`Estimated cost: ${result.pause_cost} credits`);
    }
    if (result.pause_large_consumption !== undefined) {
      lines.push(
        `Large-consumption threshold: ${result.pause_large_consumption}`,
      );
    }
    const tn = formatPauseToolName(result.pause_tool_name);
    if (tn) lines.push(`Pending tool: ${tn}`);
    if (!sawUserChoice) {
      lines.push(
        "Ask the user what to do, then call continue_project to resume.",
      );
    }
  }
  if (result.status === "cancelled") {
    lines.push("Run was cancelled. No further action needed.");
  }
  if (result.status === "error" && result.error_message) {
    lines.push(`Error: ${result.error_message}`);
  }
  if (result.status === "timeout") {
    lines.push(
      "Generation is still running. Use get_updates with the cursor below to check for new results.",
    );
  }

  if (result.task_pending) {
    lines.push(
      "Note: agent reported task_completed=false — there may be more steps remaining.",
    );
  }

  if (result.follow_up_questions?.length) {
    lines.push("Follow-ups:");
    for (const q of result.follow_up_questions) {
      lines.push(`  - ${q}`);
    }
  }

  if (result.cursor !== "0") {
    lines.push(`Cursor: ${result.cursor}`);
  }

  return lines.join("\n");
}
