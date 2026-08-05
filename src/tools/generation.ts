import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SoldyAPIClient } from "../client.js";
import { formatApiError } from "../errors.js";
import { resolveUrls } from "../files.js";

type TextBlock = { type: "text"; text: string };

interface ModelParam {
  key: string;
  type: string;
  required?: boolean;
  values?: string[];
  min?: number;
  max?: number;
  default?: unknown;
  modes?: string[];
}

interface GenerationModelEntry {
  id: string;
  label: string;
  description?: string;
  provider: string;
  model_id: string;
  premium?: boolean;
  modes?: string[] | null;
  params?: Array<ModelParam | null> | null;
}

interface GenerationTask {
  id?: string;
  project_id?: string;
  lineage_id?: string;
  status?: string;
  provider?: string;
  model?: string;
  mode?: string;
  prompt?: string;
  resolution?: string;
  ratio?: string;
  duration?: number;
  generate_audio?: boolean;
  negative_prompt?: string;
  image_size?: string;
  quality?: string;
  num_images?: number;
  output_format?: string;
  error?: string;
  failure_reason?: string;
  request?: Record<string, unknown>;
  input_assets?: Record<string, unknown>;
  results?: Record<string, unknown>;
  charged_cost?: number;
  credit_cost?: number | null;
  retry_number?: number;
  created_at?: string;
}

const JSON_OBJECT_SCHEMA = z.record(z.string(), z.unknown());

function textBlock(text: string): TextBlock {
  return { type: "text", text };
}

function textResult(text: string): { content: TextBlock[] } {
  return { content: [textBlock(text)] };
}

function errorResult(text: string): { content: TextBlock[]; isError: true } {
  return { content: [textBlock(text)], isError: true };
}

function jsonBlock(value: unknown): string {
  return `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;
}

function scalar(value: unknown): string {
  if (value === undefined || value === null || value === "") return "-";
  return String(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function resolveInputAssetValue(
  client: SoldyAPIClient,
  value: unknown,
): Promise<unknown> {
  if (typeof value === "string") {
    const [resolved] = await resolveUrls(client, [value]);
    return resolved ?? value;
  }
  if (Array.isArray(value)) {
    return Promise.all(
      value.map((item) => resolveInputAssetValue(client, item)),
    );
  }
  if (isRecord(value)) {
    const resolved: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      resolved[key] = await resolveInputAssetValue(client, entry);
    }
    return resolved;
  }
  return value;
}

async function resolveInputAssets(
  client: SoldyAPIClient,
  assets: Record<string, unknown> | undefined,
): Promise<Record<string, unknown> | undefined> {
  if (!assets) return undefined;
  const resolved: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(assets)) {
    resolved[key] = await resolveInputAssetValue(client, value);
  }
  return resolved;
}

function formatModels(kind: "video" | "image", models: GenerationModelEntry[]) {
  if (models.length === 0) return `No ${kind} models available.`;

  const lines = [
    `${kind === "video" ? "Video" : "Image"} model registry`,
    "",
    "| ID | Label | Provider | Modes | Key params |",
    "|---|---|---|---|---|",
  ];

  for (const model of models) {
    const params = Array.isArray(model.params) ? model.params : [];
    const modes = Array.isArray(model.modes) ? model.modes : [];
    const keyParams = params
      .filter(
        (param): param is ModelParam =>
          param !== null && (param.required || param.default !== undefined),
      )
      .map((param) =>
        param.default === undefined
          ? param.key
          : `${param.key}=${JSON.stringify(param.default)}`,
      )
      .slice(0, 8)
      .join(", ");
    lines.push(
      `| \`${model.id}\` | ${model.label} | ${model.provider} | ${modes.join(", ")} | ${keyParams || "-"} |`,
    );
  }

  lines.push("");
  lines.push(
    "Use the model `id` as `model`, one listed mode as `mode`, and put registry-specific values under `parameters` / `input_assets`.",
  );
  return lines.join("\n");
}

function formatTask(kind: "Video" | "Image", task: GenerationTask): string {
  const lines = [
    `${kind} task: \`${scalar(task.id)}\``,
    `Status: ${scalar(task.status)}`,
    `Project: \`${scalar(task.project_id)}\``,
    `Lineage: \`${scalar(task.lineage_id)}\``,
    `Model: ${scalar(task.model)} (${scalar(task.provider)})`,
    `Mode: ${scalar(task.mode)}`,
  ];

  if (task.prompt) lines.push(`Prompt: ${task.prompt}`);
  if (task.ratio) lines.push(`Ratio: ${task.ratio}`);
  if (task.resolution) lines.push(`Resolution: ${task.resolution}`);
  if (task.duration) lines.push(`Duration: ${task.duration}s`);
  if (task.image_size) lines.push(`Image size: ${task.image_size}`);
  if (task.quality) lines.push(`Quality: ${task.quality}`);
  if (task.num_images) lines.push(`Images: ${task.num_images}`);
  if (task.output_format) lines.push(`Output format: ${task.output_format}`);
  if (task.charged_cost != null)
    lines.push(`Credits charged: ${task.charged_cost}`);
  if (task.credit_cost != null) lines.push(`Credit cost: ${task.credit_cost}`);
  if (task.error) lines.push(`Error: ${task.error}`);
  if (task.failure_reason) lines.push(`Failure reason: ${task.failure_reason}`);
  if (task.results) {
    lines.push("Results:");
    lines.push(jsonBlock(task.results));
  }

  return lines.join("\n");
}

function formatTaskList(kind: "Video" | "Image", tasks: GenerationTask[]) {
  if (tasks.length === 0) return `No ${kind.toLowerCase()} tasks yet.`;

  const lines = [
    `${kind} tasks`,
    "",
    "| Task | Project | Status | Model | Mode | Created | Prompt |",
    "|---|---|---|---|---|---|---|",
  ];

  for (const task of tasks) {
    const prompt = (task.prompt ?? "").replace(/\n/g, " ").slice(0, 60);
    lines.push(
      `| \`${scalar(task.id)}\` | \`${scalar(task.project_id)}\` | ${scalar(task.status)} | ${scalar(task.model)} | ${scalar(task.mode)} | ${scalar(task.created_at).slice(0, 16)} | ${prompt || "-"} |`,
    );
  }

  return lines.join("\n");
}

function buildVideoGenerateBody(args: {
  project_id?: string;
  model: string;
  mode: string;
  prompt?: string;
  duration?: number;
  ratio?: string;
  resolution?: string;
  generate_audio?: boolean;
  negative_prompt?: string;
  parameters?: Record<string, unknown>;
  input_assets?: Record<string, unknown>;
}): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: args.model,
    mode: args.mode,
  };
  if (args.project_id) body.project_id = args.project_id;
  if (args.prompt) body.prompt = args.prompt;
  if (args.duration !== undefined) body.duration = args.duration;
  if (args.ratio) body.ratio = args.ratio;
  if (args.resolution) body.resolution = args.resolution;
  if (args.generate_audio !== undefined)
    body.generate_audio = args.generate_audio;
  if (args.negative_prompt !== undefined)
    body.negative_prompt = args.negative_prompt;
  if (args.parameters) body.parameters = args.parameters;
  if (args.input_assets) body.input_assets = args.input_assets;
  return body;
}

function buildImageGenerateBody(args: {
  project_id?: string;
  model: string;
  mode: string;
  prompt?: string;
  image_size?: string;
  quality?: string;
  ratio?: string;
  output_format?: string;
  num_images?: number;
  parameters?: Record<string, unknown>;
  input_assets?: Record<string, unknown>;
}): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: args.model,
    mode: args.mode,
  };
  if (args.project_id) body.project_id = args.project_id;
  if (args.prompt) body.prompt = args.prompt;
  if (args.image_size) body.image_size = args.image_size;
  if (args.quality) body.quality = args.quality;
  if (args.ratio) body.ratio = args.ratio;
  if (args.output_format) body.output_format = args.output_format;
  if (args.num_images !== undefined) body.num_images = args.num_images;
  if (args.parameters) body.parameters = args.parameters;
  if (args.input_assets) body.input_assets = args.input_assets;
  return body;
}

export function registerGenerationTools(
  server: McpServer,
  client: SoldyAPIClient,
) {
  server.tool(
    "video_list_models",
    "List unified Quick Generation video model capabilities. Use this before video_generate to discover model ids, modes, parameters, and assets. Includes Seedance 2.0/2.0 Fast, Kling 2.6, and MiniMax H3 when enabled for the API key.",
    {},
    async () => {
      const resp = await client.get<GenerationModelEntry[]>(
        "/public/video/models",
      );
      if (resp.code !== 0 || !resp.data) {
        return errorResult(formatApiError(resp));
      }
      return textResult(formatModels("video", resp.data));
    },
  );

  server.tool(
    "video_generate",
    "Submit a unified Quick Generation video task via /public/project/video/generate. This is the modern provider-agnostic path for Seedance and Kling video. Call video_list_models first when you need valid model/mode/parameter combinations.",
    {
      model: z
        .string()
        .describe("Model registry id, e.g. seedance-2.0 or kling-2.6."),
      mode: z
        .string()
        .describe(
          "Mode from video_list_models, e.g. text_to_video, references, keyframes, image_to_video.",
        ),
      project_id: z
        .string()
        .optional()
        .describe(
          "Optional vproj_* gallery project id. Omit to create a new gallery unit.",
        ),
      prompt: z.string().optional(),
      duration: z.number().int().optional(),
      ratio: z.string().optional(),
      resolution: z.string().optional(),
      generate_audio: z.boolean().optional(),
      negative_prompt: z.string().optional(),
      parameters: JSON_OBJECT_SCHEMA.optional().describe(
        "Registry-specific scalar parameters. Top-level fields above override duplicates.",
      ),
      input_assets: JSON_OBJECT_SCHEMA.optional().describe(
        "Registry-specific media slots such as image_url, video_url, audio_url, first_image_url, last_image_url.",
      ),
    },
    async (args) => {
      let inputAssets: Record<string, unknown> | undefined;
      try {
        inputAssets = await resolveInputAssets(client, args.input_assets);
      } catch (err) {
        return errorResult(
          `Failed to process input assets: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      const resp = await client.post<GenerationTask>(
        "/public/project/video/generate",
        buildVideoGenerateBody({ ...args, input_assets: inputAssets }),
      );
      if (resp.code !== 0 || !resp.data) {
        return errorResult(formatApiError(resp));
      }
      return textResult(
        `${formatTask("Video", resp.data)}\n\nPoll with video_get_task. Generation typically takes 1-3 minutes.`,
      );
    },
  );

  server.tool(
    "video_get_task",
    "Poll a unified Quick Generation video task by vidtask_* id.",
    { task_id: z.string() },
    async ({ task_id }) => {
      const resp = await client.get<GenerationTask>(
        `/public/project/video/task/${encodeURIComponent(task_id)}`,
      );
      if (resp.code !== 0 || !resp.data) {
        return errorResult(formatApiError(resp));
      }
      return textResult(formatTask("Video", resp.data));
    },
  );

  server.tool(
    "video_list_tasks",
    "List unified Quick Generation video tasks for the current org/user. Optionally filter by vproj_* project_id.",
    {
      page: z.number().int().optional(),
      page_size: z.number().int().optional(),
      project_id: z.string().optional(),
    },
    async ({ page, page_size, project_id }) => {
      const params: Record<string, string> = {
        page: String(page ?? 1),
        page_size: String(page_size ?? 20),
      };
      if (project_id) params.project_id = project_id;
      const resp = await client.get<GenerationTask[]>(
        "/public/project/video/tasks",
        params,
      );
      if (resp.code !== 0) {
        return errorResult(formatApiError(resp));
      }
      const total = resp.page?.total_count ?? resp.data?.length ?? 0;
      return textResult(
        `${formatTaskList("Video", resp.data ?? [])}\n\nTotal: ${total}, page: ${page ?? 1}`,
      );
    },
  );

  server.tool(
    "video_retry_task",
    "Retry a terminal unified Quick Generation video task. Returns the new vidtask_* in the same lineage/gallery project.",
    { task_id: z.string() },
    async ({ task_id }) => {
      const resp = await client.post<GenerationTask>(
        "/public/project/video/retry",
        { task_id },
      );
      if (resp.code !== 0 || !resp.data) {
        return errorResult(formatApiError(resp));
      }
      return textResult(formatTask("Video", resp.data));
    },
  );

  server.tool(
    "video_delete_task",
    "Soft-delete a terminal unified Quick Generation video task. Running tasks are rejected by the API.",
    { task_id: z.string() },
    async ({ task_id }) => {
      const resp = await client.delete(
        `/public/project/video/task/${encodeURIComponent(task_id)}`,
      );
      if (resp.code !== 0) {
        return errorResult(formatApiError(resp));
      }
      return textResult(`Deleted video task \`${task_id}\`.`);
    },
  );

  server.tool(
    "video_get_lineage",
    "Get all retry attempts in the same unified Quick Generation video lineage for a vidtask_* id.",
    { task_id: z.string() },
    async ({ task_id }) => {
      const resp = await client.get<GenerationTask[]>(
        `/public/project/video/lineage/${encodeURIComponent(task_id)}`,
      );
      if (resp.code !== 0 || !resp.data) {
        return errorResult(formatApiError(resp));
      }
      return textResult(jsonBlock(resp.data));
    },
  );

  server.tool(
    "image_list_models",
    "List unified Quick Generation image model capabilities. Use this before image_generate to discover model ids, modes, parameters, and assets. Includes GPT Image 2 and Gemini models when enabled for the API key.",
    {},
    async () => {
      const resp = await client.get<GenerationModelEntry[]>(
        "/public/image/models",
      );
      if (resp.code !== 0 || !resp.data) {
        return errorResult(formatApiError(resp));
      }
      return textResult(formatModels("image", resp.data));
    },
  );

  server.tool(
    "image_generate",
    "Submit a unified Quick Generation image task via /public/project/image/generate. This is the modern provider-agnostic path for GPT Image 2 and Gemini image generation. Call image_list_models first when you need valid model/mode/parameter combinations.",
    {
      model: z
        .string()
        .describe(
          "Model registry id, e.g. gpt-image-2 or gemini-3-pro-image-preview.",
        ),
      mode: z
        .string()
        .describe(
          "Mode from image_list_models, e.g. text_to_image or image_to_image.",
        ),
      project_id: z
        .string()
        .optional()
        .describe(
          "Optional improj_* gallery project id. Omit to create a new gallery unit.",
        ),
      prompt: z.string().optional(),
      image_size: z.string().optional(),
      quality: z.string().optional(),
      ratio: z.string().optional(),
      output_format: z.string().optional(),
      num_images: z.number().int().optional(),
      parameters: JSON_OBJECT_SCHEMA.optional().describe(
        "Registry-specific scalar parameters. Top-level fields above override duplicates.",
      ),
      input_assets: JSON_OBJECT_SCHEMA.optional().describe(
        "Registry-specific media slots such as image_urls.",
      ),
    },
    async (args) => {
      let inputAssets: Record<string, unknown> | undefined;
      try {
        inputAssets = await resolveInputAssets(client, args.input_assets);
      } catch (err) {
        return errorResult(
          `Failed to process input assets: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      const resp = await client.post<GenerationTask>(
        "/public/project/image/generate",
        buildImageGenerateBody({ ...args, input_assets: inputAssets }),
      );
      if (resp.code !== 0 || !resp.data) {
        return errorResult(formatApiError(resp));
      }
      return textResult(
        `${formatTask("Image", resp.data)}\n\nPoll with image_get_task. Generation typically takes 1-4 minutes.`,
      );
    },
  );

  server.tool(
    "image_get_task",
    "Poll a unified Quick Generation image task by imgtask_* id.",
    { task_id: z.string() },
    async ({ task_id }) => {
      const resp = await client.get<GenerationTask>(
        `/public/project/image/task/${encodeURIComponent(task_id)}`,
      );
      if (resp.code !== 0 || !resp.data) {
        return errorResult(formatApiError(resp));
      }
      return textResult(formatTask("Image", resp.data));
    },
  );

  server.tool(
    "image_list_tasks",
    "List unified Quick Generation image tasks for the current org/user. Optionally filter by improj_* project_id.",
    {
      page: z.number().int().optional(),
      page_size: z.number().int().optional(),
      project_id: z.string().optional(),
    },
    async ({ page, page_size, project_id }) => {
      const params: Record<string, string> = {
        page: String(page ?? 1),
        page_size: String(page_size ?? 20),
      };
      if (project_id) params.project_id = project_id;
      const resp = await client.get<GenerationTask[]>(
        "/public/project/image/tasks",
        params,
      );
      if (resp.code !== 0) {
        return errorResult(formatApiError(resp));
      }
      const total = resp.page?.total_count ?? resp.data?.length ?? 0;
      return textResult(
        `${formatTaskList("Image", resp.data ?? [])}\n\nTotal: ${total}, page: ${page ?? 1}`,
      );
    },
  );

  server.tool(
    "image_retry_task",
    "Retry a terminal unified Quick Generation image task. Returns the new imgtask_* in the same lineage/gallery project.",
    { task_id: z.string() },
    async ({ task_id }) => {
      const resp = await client.post<GenerationTask>(
        "/public/project/image/retry",
        { task_id },
      );
      if (resp.code !== 0 || !resp.data) {
        return errorResult(formatApiError(resp));
      }
      return textResult(formatTask("Image", resp.data));
    },
  );

  server.tool(
    "image_delete_task",
    "Soft-delete a terminal unified Quick Generation image task. Running tasks are rejected by the API.",
    { task_id: z.string() },
    async ({ task_id }) => {
      const resp = await client.delete(
        `/public/project/image/task/${encodeURIComponent(task_id)}`,
      );
      if (resp.code !== 0) {
        return errorResult(formatApiError(resp));
      }
      return textResult(`Deleted image task \`${task_id}\`.`);
    },
  );

  server.tool(
    "image_get_lineage",
    "Get all retry attempts in the same unified Quick Generation image lineage for an imgtask_* id.",
    { task_id: z.string() },
    async ({ task_id }) => {
      const resp = await client.get<GenerationTask[]>(
        `/public/project/image/lineage/${encodeURIComponent(task_id)}`,
      );
      if (resp.code !== 0 || !resp.data) {
        return errorResult(formatApiError(resp));
      }
      return textResult(jsonBlock(resp.data));
    },
  );
}
