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

The call blocks until the agent run completes, pauses, errors, or times out (default 5 minutes). For long-running generations, use a higher timeout_seconds.

Required: ratio — the video aspect ratio. Choose based on target platform:
- 9:16 → TikTok, Reels, Shorts (vertical)
- 16:9 → YouTube, landscape video
- 1:1 → Instagram, square
- 4:3, 3:4, 3:2, 2:3, 21:9 → other formats

If the response status is "paused", the agent is waiting for user input (e.g., credits, approval). Show the pause reason to the user, then call continue_project when ready.

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
      const body: Record<string, unknown> = {
        project_id,
        content: message,
        options: {
          ratio,
          ...(brand_id ? { brand_id } : {}),
          ...(input_mode ? { input_mode } : {}),
          ...(resolvedSeedanceRef
            ? { seedance_reference_url: resolvedSeedanceRef }
            : {}),
        },
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

function formatChatResult(result: ChatResult): string {
  const lines: string[] = [];

  // Status header
  const statusEmoji: Record<string, string> = {
    completed: "completed",
    paused: "paused",
    error: "error",
    timeout: "timeout",
  };
  lines.push(
    `Status: ${statusEmoji[result.status] ?? result.status} (${result.elapsed_seconds}s)`,
  );
  if (result.run_id) lines.push(`Run: ${result.run_id}`);
  lines.push("");

  // Agent messages
  if (result.messages.length > 0) {
    for (const msg of result.messages) {
      if (msg.tool) {
        lines.push(
          `[tool: ${msg.tool.name}${msg.tool.state ? ` (${msg.tool.state})` : ""}]`,
        );
        if (msg.content) lines.push(`  ${msg.content}`);
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
  if (result.status === "paused" && result.pause_reason) {
    lines.push(
      `Pause reason: ${result.pause_reason}`,
      "Ask the user what to do, then call continue_project to resume.",
    );
  }
  if (result.status === "error" && result.error_message) {
    lines.push(`Error: ${result.error_message}`);
  }
  if (result.status === "timeout") {
    lines.push(
      "Generation is still running. Use get_updates with the cursor below to check for new results.",
    );
  }

  if (result.cursor !== "0") {
    lines.push(`Cursor: ${result.cursor}`);
  }

  return lines.join("\n");
}
