import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SoldyAPIClient } from "../client.js";
import { formatApiError } from "../errors.js";
import { resolveUrls } from "../files.js";

interface SendMessageResp {
  message_id: string;
  status: string;
}

interface Message {
  id: string;
  role: string;
  content: string;
  event: string;
  run_id: string;
  materials: Material[];
  tool: { name: string } | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface Material {
  url: string;
  type: string;
  thumbnail?: string;
  display_title?: string;
  asset_category?: string;
}

export function registerMessageTools(
  server: McpServer,
  client: SoldyAPIClient,
) {
  server.tool(
    "send_message",
    `Send a message to the project agent (fire-and-forget). Returns immediately after sending.

**For most use cases, prefer \`chat\` instead** — it sends the message AND waits for the complete response in one call.

Use \`send_message\` only when you want async control: send the message, do other work, then call \`get_updates(project_id)\` to check for results later.

Required: ratio — the video aspect ratio (9:16, 16:9, 1:1, 4:3, 3:4, 3:2, 2:3, 21:9).

Also supports material_urls, brand_id, input_mode ("agent"/"seedance"), and seedance_reference_url.`,
    {
      project_id: z.string(),
      content: z
        .string()
        .describe("Message to the agent describing what to generate or modify"),
      material_urls: z
        .array(z.string())
        .optional()
        .describe("Image/video/audio URLs or local file paths"),
      ratio: z
        .enum(["9:16", "16:9", "1:1", "4:3", "3:4", "3:2", "2:3", "21:9"])
        .describe(
          "Video aspect ratio (required). Common: '9:16' (TikTok/Reels/Shorts), '16:9' (YouTube/landscape), '1:1' (Instagram/square), '4:3'/'3:4', '3:2'/'2:3', '21:9' (ultra-wide)",
        ),
      brand_id: z
        .string()
        .optional()
        .describe(
          "Brand ID for generation context. Get from list_brands or extract_brand.",
        ),
      input_mode: z
        .enum(["agent", "seedance"])
        .optional()
        .describe(
          "'agent' (default) runs the full production pipeline. 'seedance' uses Seedance 2.0 direct video generation from a single reference image — requires seedance_reference_url.",
        ),
      seedance_reference_url: z
        .string()
        .optional()
        .describe(
          "Reference image for Seedance 2.0. Required when input_mode='seedance'. Local file paths are auto-uploaded; GCS/http URLs pass through.",
        ),
    },
    async ({
      project_id,
      content,
      material_urls,
      ratio,
      brand_id,
      input_mode,
      seedance_reference_url,
    }) => {
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

      const body: Record<string, unknown> = {
        project_id,
        content,
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

      const matInfo = resolvedUrls?.length
        ? ` with ${resolvedUrls.length} material(s)`
        : "";
      const brandInfo = brand_id ? ` (brand: ${brand_id})` : "";
      const modeInfo = input_mode === "seedance" ? " [mode: seedance 2.0]" : "";
      return {
        content: [
          {
            type: "text" as const,
            text: `Message sent${matInfo}${brandInfo}${modeInfo}, ratio: ${ratio}. Status: ${resp.data.status}\nUse get_updates(project_id) to check for results, or get_project_status for a quick status check.`,
          },
        ],
      };
    },
  );

  server.tool(
    "pause_project",
    "Pause the currently running agent generation. Use when the user wants to stop the agent temporarily without losing progress.",
    { project_id: z.string(), run_id: z.string().optional() },
    async ({ project_id, run_id }) => {
      const resp = await client.post("/public/project/pause", {
        project_id,
        run_id: run_id ?? "",
      });
      if (resp.code !== 0)
        return {
          content: [{ type: "text" as const, text: formatApiError(resp) }],
          isError: true,
        };
      return {
        content: [
          {
            type: "text" as const,
            text: "Project paused. Use continue_project to resume.",
          },
        ],
      };
    },
  );

  server.tool(
    "continue_project",
    "Resume a paused project. Use after pause_project or when the agent paused due to credits/approval. If paused for credits, ensure the account has been topped up first.",
    {
      project_id: z.string(),
      run_id: z.string().optional(),
      should_remind: z
        .boolean()
        .optional()
        .describe(
          "Set to false to skip future pause reminders for this project",
        ),
    },
    async ({ project_id, run_id, should_remind }) => {
      const body: Record<string, unknown> = { project_id };
      if (run_id) body.run_id = run_id;
      if (should_remind !== undefined) body.should_remind = should_remind;

      const resp = await client.post<SendMessageResp>(
        "/public/project/continue",
        body,
      );
      if (resp.code !== 0 || !resp.data)
        return {
          content: [{ type: "text" as const, text: formatApiError(resp) }],
          isError: true,
        };
      return {
        content: [
          {
            type: "text" as const,
            text: `Project resumed. Status: ${resp.data.status}\nPoll with get_project_status.`,
          },
        ],
      };
    },
  );

  server.tool(
    "stop_project",
    "Stop a running or paused project completely. The project can be restarted later with send_message.",
    { project_id: z.string() },
    async ({ project_id }) => {
      const resp = await client.post("/public/project/stop", { project_id });
      if (resp.code !== 0)
        return {
          content: [{ type: "text" as const, text: formatApiError(resp) }],
          isError: true,
        };
      return {
        content: [
          {
            type: "text" as const,
            text: "Project stopped. Use send_message to start a new run.",
          },
        ],
      };
    },
  );

  server.tool(
    "list_messages",
    "Get conversation history for a project. Shows messages with role, content, materials, and tool calls.",
    {
      project_id: z.string(),
      page: z.number().optional(),
      page_size: z.number().optional(),
    },
    async ({ project_id, page, page_size }) => {
      const params: Record<string, string> = { project_id };
      if (page) params.page = String(page);
      if (page_size) params.page_size = String(page_size);

      const resp = await client.get<Message[]>(
        "/public/project/message/list",
        params,
      );
      if (resp.code !== 0)
        return {
          content: [{ type: "text" as const, text: formatApiError(resp) }],
          isError: true,
        };

      const messages = resp.data ?? [];
      if (messages.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No messages. Use send_message to start.",
            },
          ],
        };
      }

      const total = resp.page?.total_count ?? messages.length;
      const lines = [`Page ${page ?? 1} (${total} total)\n`];

      for (const msg of messages) {
        const role = msg.role === "user" ? "[user]" : "[agent]";
        const time = msg.created_at?.slice(11, 16) ?? "";

        let line = `${time} ${role}`;
        if (msg.event && msg.event !== "ClientProjectMessage")
          line += ` (${msg.event})`;

        if (msg.content) {
          const preview =
            msg.content.length > 120
              ? `${msg.content.slice(0, 120)}...`
              : msg.content;
          line += ` ${preview}`;
        }

        if (msg.tool?.name) line += `\n  Tool: ${msg.tool.name}`;
        if (msg.materials?.length) {
          const counts: Record<string, number> = {};
          for (const m of msg.materials)
            counts[m.type] = (counts[m.type] ?? 0) + 1;
          line += `\n  Materials: ${Object.entries(counts)
            .map(([t, n]) => `${n} ${t}`)
            .join(", ")}`;
        }
        // Show pause reason if present
        if (msg.event === "RunPaused" && msg.metadata) {
          const reason = (msg.metadata as Record<string, unknown>).reason;
          if (reason) line += `\n  Pause reason: ${reason}`;
        }

        lines.push(line);
      }

      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    },
  );

  server.tool(
    "get_project_materials",
    "Get all generated assets (videos, images, audio, documents). Use after generation completes to see deliverables.",
    { project_id: z.string() },
    async ({ project_id }) => {
      const resp = await client.get<Material[]>("/public/project/materials", {
        project_id,
      });
      if (resp.code !== 0)
        return {
          content: [{ type: "text" as const, text: formatApiError(resp) }],
          isError: true,
        };

      const materials = resp.data ?? [];
      if (materials.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No materials yet. Check get_project_status for progress.",
            },
          ],
        };
      }

      const lines = [`${materials.length} material(s):\n`];
      for (let i = 0; i < materials.length; i++) {
        const m = materials[i];
        let line = `${i + 1}. [${m.type}] ${m.url}`;
        if (m.thumbnail) line += `\n   Thumbnail: ${m.thumbnail}`;
        if (m.display_title) line += `\n   Title: ${m.display_title}`;
        if (m.asset_category) line += `\n   Category: ${m.asset_category}`;
        lines.push(line);
      }

      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    },
  );
}
