import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SoldyAPIClient } from "../client.js";
import { formatApiError } from "../errors.js";

interface VideoStatusResponse {
  video_id: string;
  status: string;
  video_url: string;
  duration: number;
  error_msg: string;
}

interface RecastSession {
  id: string;
}

interface RecastPromptResponse {
  prompt: string;
}

interface RecastVideoResponse {
  video_id: string;
  task_id: string;
  status: string;
}

interface CineAdAnalyzeResponse {
  analysis_id: string;
  movie_title: string;
  keyframe_url: string;
  prop_name: string;
  why_it_fits: string;
  similarity: number;
}

interface CineAdPromptResponse {
  prompt_id: string;
  seedance_prompt: string;
  ad_script: {
    hook: string;
    body: string;
    cta: string;
    hook_timing: string;
    body_timing: string;
    cta_timing: string;
  };
}

interface CineAdSession {
  id: string;
}

interface ImageKitSession {
  id: string;
}

interface ImageKitAnalyzeResponse {
  analysis_id: string;
  product_category: string;
  product_description: string;
  suggested_scenes: string[];
  color_palette: string;
  background_type: string;
}

interface ImageKitGenerateResponse {
  generation_id: string;
  images: Array<{
    key: string;
    label: string;
    url: string;
    ratio: string;
    width: number;
    height: number;
  }>;
}

interface HistoryListItem {
  id: string;
  title: string;
  thumbnail_url?: string;
  created_at: number;
  credits: number;
  status: string;
  kit_type?: string;
  image_count?: number;
}

interface HistoryListResponse {
  items: HistoryListItem[];
  page?: { total_count: number; page_count: number; page_index: number };
}

const VIDEO_TERMINAL = new Set(["succeeded", "failed", "completed", "error"]);

async function pollVideoStatus(
  client: SoldyAPIClient,
  endpoint: "/public/recast/video/status" | "/public/cinead/video/status",
  videoId: string,
  timeoutSeconds: number,
): Promise<VideoStatusResponse | { timedOut: true; lastStatus: string }> {
  const startMs = Date.now();
  const deadlineMs = startMs + timeoutSeconds * 1000;
  const pollIntervalMs = 5000;
  let lastStatus = "pending";

  while (Date.now() < deadlineMs) {
    await new Promise((r) => setTimeout(r, pollIntervalMs));
    try {
      const resp = await client.post<VideoStatusResponse>(endpoint, {
        video_id: videoId,
      });
      const data = resp.data;
      if (!data) continue;
      lastStatus = data.status;
      if (VIDEO_TERMINAL.has(data.status)) return data;
    } catch {
      // transient — keep polling
    }
  }
  return { timedOut: true, lastStatus };
}

function formatHistoryList(
  kind: string,
  page: number,
  resp: HistoryListResponse,
): string {
  const items = resp.items ?? [];
  if (items.length === 0) {
    return `No ${kind} history yet.`;
  }
  const total = resp.page?.total_count ?? items.length;
  const lines = [
    `${kind} history — total ${total}, page ${page}`,
    "",
    "| ID | Title | Status | Credits | Created |",
    "|---|---|---|---|---|",
  ];
  for (const it of items) {
    const created = it.created_at
      ? new Date(it.created_at * 1000).toISOString().slice(0, 16)
      : "";
    lines.push(
      `| \`${it.id}\` | ${it.title || "—"} | ${it.status} | ${it.credits ?? 0} | ${created} |`,
    );
  }
  return lines.join("\n");
}

export function registerWorkflowTools(
  server: McpServer,
  client: SoldyAPIClient,
) {
  // -------------------------------------------------------------------------
  // Recast — restyle an existing source video.
  // session → prompt → video → poll status
  // -------------------------------------------------------------------------
  server.tool(
    "recast_generate",
    `Generate a restyled video using Recast (style-transfer or object-replacement on a user-supplied source clip).

Source video must already be uploaded — call \`upload_material\` first to get the URL/name/size/mime/thumbnail. Recast generation typically takes a few minutes; this tool blocks up to \`timeout_seconds\` (default 600) and returns the final video URL when finished.

\`recast_dimension\` is one of "Style Transfer" or "Object Replacement". \`recast_description\` is what the user wants done in plain English.`,
    {
      video_url: z.string().describe("URL from upload_material response"),
      video_name: z.string().describe('Filename (e.g. "clip.mp4")'),
      video_size: z.number().int().describe("Bytes from upload response"),
      video_mime: z.string().describe('MIME type (e.g. "video/mp4")'),
      video_duration: z
        .number()
        .int()
        .describe("Duration in seconds (0 if unknown)"),
      video_thumbnail_url: z
        .string()
        .optional()
        .describe("Thumbnail URL from upload response"),
      recast_dimension: z.enum(["Style Transfer", "Object Replacement"]),
      recast_description: z.string(),
      product_url: z.string().optional(),
      force: z
        .boolean()
        .optional()
        .describe("Proceed even if balance is tight"),
      timeout_seconds: z.number().int().optional(),
    },
    async (args) => {
      const sessionResp = await client.post<RecastSession>(
        "/public/recast/sessions",
        {
          video_info: {
            url: args.video_url,
            name: args.video_name,
            size: args.video_size,
            duration: args.video_duration,
            mime: args.video_mime,
            thumbnail_url: args.video_thumbnail_url ?? "",
          },
          recast_dimension: args.recast_dimension,
          recast_description: args.recast_description,
          product_url: args.product_url ?? "",
          force: args.force ?? false,
        },
      );
      if (sessionResp.code !== 0 || !sessionResp.data) {
        return {
          content: [
            { type: "text" as const, text: formatApiError(sessionResp) },
          ],
          isError: true,
        };
      }
      const sessionId = sessionResp.data.id;

      const promptResp = await client.post<RecastPromptResponse>(
        "/public/recast/prompt",
        { session_id: sessionId },
      );
      if (promptResp.code !== 0 || !promptResp.data) {
        return {
          content: [
            { type: "text" as const, text: formatApiError(promptResp) },
          ],
          isError: true,
        };
      }
      const prompt = promptResp.data.prompt;

      const videoResp = await client.post<RecastVideoResponse>(
        "/public/recast/video",
        { session_id: sessionId, prompt },
      );
      if (videoResp.code !== 0 || !videoResp.data) {
        return {
          content: [{ type: "text" as const, text: formatApiError(videoResp) }],
          isError: true,
        };
      }
      const videoId = videoResp.data.video_id;

      const result = await pollVideoStatus(
        client,
        "/public/recast/video/status",
        videoId,
        args.timeout_seconds ?? 600,
      );

      if ("timedOut" in result) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Recast still running (last status: ${result.lastStatus}). Use recast_get_video_status with video_id \`${videoId}\` to check.`,
            },
          ],
        };
      }
      if (result.status === "failed" || result.status === "error") {
        return {
          content: [
            {
              type: "text" as const,
              text: `Recast failed: ${result.error_msg || "unknown"}`,
            },
          ],
          isError: true,
        };
      }
      return {
        content: [
          {
            type: "text" as const,
            text: `Recast complete (session \`${sessionId}\`):\n${result.video_url}\nDuration: ${result.duration}s\nPrompt used: ${prompt.slice(0, 200)}${prompt.length > 200 ? "..." : ""}`,
          },
        ],
      };
    },
  );

  server.tool(
    "recast_get_video_status",
    "Poll a single Recast video by video_id. Returns status (pending/running/succeeded/failed) and url when done.",
    { video_id: z.string() },
    async ({ video_id }) => {
      const resp = await client.post<VideoStatusResponse>(
        "/public/recast/video/status",
        { video_id },
      );
      if (resp.code !== 0 || !resp.data) {
        return {
          content: [{ type: "text" as const, text: formatApiError(resp) }],
          isError: true,
        };
      }
      const d = resp.data;
      const lines = [`Status: ${d.status}`];
      if (d.video_url) lines.push(`URL: ${d.video_url}`);
      if (d.duration) lines.push(`Duration: ${d.duration}s`);
      if (d.error_msg) lines.push(`Error: ${d.error_msg}`);
      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    },
  );

  server.tool(
    "recast_list_history",
    "List Recast generation history (paginated).",
    {
      page: z.number().int().optional(),
      page_size: z.number().int().optional(),
    },
    async ({ page, page_size }) => {
      const params: Record<string, string> = {};
      if (page) params.page = String(page);
      if (page_size) params.page_size = String(page_size);
      const resp = await client.get<HistoryListResponse>(
        "/public/recast/history",
        params,
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
            text: formatHistoryList("Recast", page ?? 1, resp.data),
          },
        ],
      };
    },
  );

  server.tool(
    "recast_get_history_detail",
    "Get full detail (input + generated video + prompt) for one Recast session.",
    { session_id: z.string() },
    async ({ session_id }) => {
      const resp = await client.post<Record<string, unknown>>(
        "/public/recast/history/detail",
        { session_id },
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
            text: `\`\`\`json\n${JSON.stringify(resp.data, null, 2)}\n\`\`\``,
          },
        ],
      };
    },
  );

  // -------------------------------------------------------------------------
  // CineAd — match a product to a famous movie scene + render an ad.
  // session → analyze → prompt → video → poll status
  // -------------------------------------------------------------------------
  server.tool(
    "cinead_generate",
    `Generate a cinematic-style ad with CineAd. Pipeline: upload product image → match it to a movie scene → generate ad script (Hook/Body/CTA) + Seedance prompt → render video.

The product image must already be uploaded via \`upload_material\`. CineAd typically takes a few minutes; this tool blocks up to \`timeout_seconds\` (default 600).`,
    {
      image_url: z.string().describe("Product image URL from upload_material"),
      product_name: z.string(),
      key_selling_point: z.string().optional(),
      force: z.boolean().optional(),
      timeout_seconds: z.number().int().optional(),
    },
    async (args) => {
      const sessionResp = await client.post<CineAdSession>(
        "/public/cinead/sessions",
        {
          url: args.image_url,
          product_name: args.product_name,
          key_selling_point: args.key_selling_point ?? "",
        },
      );
      if (sessionResp.code !== 0 || !sessionResp.data) {
        return {
          content: [
            { type: "text" as const, text: formatApiError(sessionResp) },
          ],
          isError: true,
        };
      }
      const sessionId = sessionResp.data.id;

      const analyzeResp = await client.post<CineAdAnalyzeResponse>(
        "/public/cinead/analyze",
        { session_id: sessionId },
      );
      if (analyzeResp.code !== 0 || !analyzeResp.data) {
        return {
          content: [
            { type: "text" as const, text: formatApiError(analyzeResp) },
          ],
          isError: true,
        };
      }
      const analysis = analyzeResp.data;

      const promptResp = await client.post<CineAdPromptResponse>(
        "/public/cinead/prompt",
        { analysis_id: analysis.analysis_id, force: args.force ?? false },
      );
      if (promptResp.code !== 0 || !promptResp.data) {
        return {
          content: [
            { type: "text" as const, text: formatApiError(promptResp) },
          ],
          isError: true,
        };
      }
      const prompt = promptResp.data;

      const videoResp = await client.post<RecastVideoResponse>(
        "/public/cinead/video",
        { session_id: sessionId, prompt_id: prompt.prompt_id },
      );
      if (videoResp.code !== 0 || !videoResp.data) {
        return {
          content: [{ type: "text" as const, text: formatApiError(videoResp) }],
          isError: true,
        };
      }
      const videoId = videoResp.data.video_id;

      const result = await pollVideoStatus(
        client,
        "/public/cinead/video/status",
        videoId,
        args.timeout_seconds ?? 600,
      );

      const scriptSummary = `Ad script\n  Hook (${prompt.ad_script.hook_timing}): ${prompt.ad_script.hook}\n  Body (${prompt.ad_script.body_timing}): ${prompt.ad_script.body}\n  CTA  (${prompt.ad_script.cta_timing}): ${prompt.ad_script.cta}`;
      const sceneSummary = `Matched scene: ${analysis.movie_title} — ${analysis.prop_name} (similarity ${analysis.similarity.toFixed(2)})\nWhy it fits: ${analysis.why_it_fits}`;

      if ("timedOut" in result) {
        return {
          content: [
            {
              type: "text" as const,
              text: `CineAd still rendering (last status: ${result.lastStatus}). Use cinead_get_video_status with video_id \`${videoId}\`.\n\n${sceneSummary}\n\n${scriptSummary}`,
            },
          ],
        };
      }
      if (result.status === "failed" || result.status === "error") {
        return {
          content: [
            {
              type: "text" as const,
              text: `CineAd failed: ${result.error_msg || "unknown"}\n\n${sceneSummary}\n\n${scriptSummary}`,
            },
          ],
          isError: true,
        };
      }
      return {
        content: [
          {
            type: "text" as const,
            text: `CineAd complete (session \`${sessionId}\`):\n${result.video_url}\nDuration: ${result.duration}s\n\n${sceneSummary}\n\n${scriptSummary}`,
          },
        ],
      };
    },
  );

  server.tool(
    "cinead_get_video_status",
    "Poll a CineAd video by video_id.",
    { video_id: z.string() },
    async ({ video_id }) => {
      const resp = await client.post<VideoStatusResponse>(
        "/public/cinead/video/status",
        { video_id },
      );
      if (resp.code !== 0 || !resp.data) {
        return {
          content: [{ type: "text" as const, text: formatApiError(resp) }],
          isError: true,
        };
      }
      const d = resp.data;
      const lines = [`Status: ${d.status}`];
      if (d.video_url) lines.push(`URL: ${d.video_url}`);
      if (d.duration) lines.push(`Duration: ${d.duration}s`);
      if (d.error_msg) lines.push(`Error: ${d.error_msg}`);
      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    },
  );

  server.tool(
    "cinead_list_history",
    "List CineAd generation history.",
    {
      page: z.number().int().optional(),
      page_size: z.number().int().optional(),
    },
    async ({ page, page_size }) => {
      const params: Record<string, string> = {};
      if (page) params.page = String(page);
      if (page_size) params.page_size = String(page_size);
      const resp = await client.get<HistoryListResponse>(
        "/public/cinead/history",
        params,
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
            text: formatHistoryList("CineAd", page ?? 1, resp.data),
          },
        ],
      };
    },
  );

  server.tool(
    "cinead_get_history_detail",
    "Get full detail for one CineAd session (matched scene, ad script, video).",
    { session_id: z.string() },
    async ({ session_id }) => {
      const resp = await client.post<Record<string, unknown>>(
        "/public/cinead/history/detail",
        { session_id },
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
            text: `\`\`\`json\n${JSON.stringify(resp.data, null, 2)}\n\`\`\``,
          },
        ],
      };
    },
  );

  // -------------------------------------------------------------------------
  // ImageKit — produce a set of marketing images for one product (synchronous).
  // session → analyze → generate
  // -------------------------------------------------------------------------
  server.tool(
    "imagekit_generate",
    `Generate a marketing image kit for a product (Shopify, Amazon, or Meta layout). Pipeline: upload image → analyze product → generate set.

This is synchronous — no polling. Typically returns within 1–3 minutes.

\`kit_type\` selects the layout pack: "shopify" | "amazon" | "meta". \`image_types\` is optional — leave empty to generate the full set.`,
    {
      image_url: z.string().describe("Product image URL from upload_material"),
      product_name: z.string(),
      kit_type: z.enum(["shopify", "amazon", "meta"]),
      key_selling_point: z.string().optional(),
      image_types: z
        .array(z.string())
        .optional()
        .describe("Subset of images to render (empty = all)"),
      force: z.boolean().optional(),
    },
    async (args) => {
      const sessionResp = await client.post<ImageKitSession>(
        "/public/imagekit/sessions",
        {
          url: args.image_url,
          product_name: args.product_name,
          key_selling_point: args.key_selling_point ?? "",
          kit_type: args.kit_type,
        },
      );
      if (sessionResp.code !== 0 || !sessionResp.data) {
        return {
          content: [
            { type: "text" as const, text: formatApiError(sessionResp) },
          ],
          isError: true,
        };
      }
      const sessionId = sessionResp.data.id;

      const analyzeResp = await client.post<ImageKitAnalyzeResponse>(
        "/public/imagekit/analyze",
        { session_id: sessionId },
      );
      if (analyzeResp.code !== 0 || !analyzeResp.data) {
        return {
          content: [
            { type: "text" as const, text: formatApiError(analyzeResp) },
          ],
          isError: true,
        };
      }
      const analysis = analyzeResp.data;

      const generateResp = await client.post<ImageKitGenerateResponse>(
        "/public/imagekit/generate",
        {
          session_id: sessionId,
          analysis_id: analysis.analysis_id,
          image_types: args.image_types ?? [],
          force: args.force ?? false,
        },
      );
      if (generateResp.code !== 0 || !generateResp.data) {
        return {
          content: [
            { type: "text" as const, text: formatApiError(generateResp) },
          ],
          isError: true,
        };
      }

      const images = generateResp.data.images ?? [];
      const lines = [
        `ImageKit complete (session \`${sessionId}\`, generation \`${generateResp.data.generation_id}\`)`,
        `Category: ${analysis.product_category}`,
        `Background: ${analysis.background_type}`,
        "",
        `${images.length} image(s):`,
        "",
      ];
      for (const img of images) {
        lines.push(
          `- **${img.label}** (${img.key}, ${img.ratio}, ${img.width}×${img.height})\n  ${img.url}`,
        );
      }
      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    },
  );

  server.tool(
    "imagekit_list_history",
    "List ImageKit generation history.",
    {
      page: z.number().int().optional(),
      page_size: z.number().int().optional(),
    },
    async ({ page, page_size }) => {
      const params: Record<string, string> = {};
      if (page) params.page = String(page);
      if (page_size) params.page_size = String(page_size);
      const resp = await client.get<HistoryListResponse>(
        "/public/imagekit/history",
        params,
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
            text: formatHistoryList("ImageKit", page ?? 1, resp.data),
          },
        ],
      };
    },
  );

  server.tool(
    "imagekit_get_history_detail",
    "Get full detail for one ImageKit session (input + generated images).",
    { session_id: z.string() },
    async ({ session_id }) => {
      const resp = await client.post<Record<string, unknown>>(
        "/public/imagekit/history/detail",
        { session_id },
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
            text: `\`\`\`json\n${JSON.stringify(resp.data, null, 2)}\n\`\`\``,
          },
        ],
      };
    },
  );
}
