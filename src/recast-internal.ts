#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { api, output, recordID, requestKey } from "./recast-http.js";

const server = new McpServer({
  name: "soldy-recast-internal",
  version: "1.0.0",
});
const call = api("admin"),
  id = z.number().int().positive();
const taskCount = id
  .max(5)
  .optional()
  .describe("Tests per candidate (1-5, default 1).");
server.registerTool(
  "sync_showcases",
  {
    description:
      "Queue a Higgsfield showcase feed scan. Use only the all category for latest. Each category may appear once.",
    inputSchema: z
      .object({
        evaluation: z
          .object({
            workspace_id: recordID,
            task_count: taskCount,
            max_credits: id,
            request_key: z.uuid(),
          })
          .optional(),
        sort: z.enum(["latest", "trending"]),
        categories: z
          .array(
            z.enum([
              "all",
              "lifestyle",
              "fun",
              "pets",
              "music videos",
              "with friends",
              "sports",
            ]),
          )
          .min(1)
          .max(7)
          .refine(
            (categories) => new Set(categories).size === categories.length,
            "Categories must be unique",
          ),
        min_likes: z.number().int().nonnegative(),
        min_recreates: z.number().int().nonnegative(),
        max_pages: z
          .number()
          .int()
          .nonnegative()
          .max(2000)
          .describe("Maximum pages per category. Use 0 to scan all pages."),
      })
      .refine(
        (p) =>
          p.sort !== "latest" ||
          (p.categories.length === 1 && p.categories[0] === "all"),
        {
          path: ["categories"],
          message: "Latest scans require exactly the all category",
        },
      ),
  },
  async (p) => output(await call(p.evaluation ? "workflows" : "syncs", p)),
);
server.registerTool(
  "get_sync",
  { inputSchema: { run_id: z.uuid() } },
  async (p) => output(await call(`syncs/${p.run_id}`)),
);
server.registerTool(
  "import_link",
  { inputSchema: { url: z.url().max(2048), request_key: requestKey } },
  async (p) => output(await call("imports", p)),
);
server.registerTool(
  "get_batch_progress",
  {
    description:
      "Read import counts and paginated candidates with review and evaluation status for this scan.",
    inputSchema: { run_id: z.uuid(), page: id.default(1) },
  },
  async ({ run_id, page }) =>
    output(await call(`syncs/${run_id}/progress?page=${page}`)),
);
server.registerTool(
  "quote_evaluation",
  {
    inputSchema: { candidate_id: id, task_count: taskCount },
  },
  async ({ candidate_id, task_count }) =>
    output(
      await call(
        `candidates/${candidate_id}/quote${task_count === undefined ? "" : `?task_count=${task_count}`}`,
      ),
    ),
);
server.registerTool(
  "publish_evaluation_result",
  {
    description:
      "Publish the explicitly selected successful task in the connected environment.",
    inputSchema: {
      id,
      task_id: recordID,
      catalog_type: z.enum(["explore", "trending"]),
    },
  },
  async ({ id, task_id, catalog_type }) =>
    output(
      await call(`evaluations/${id}/results/${task_id}/publish`, {
        catalog_type,
      }),
    ),
);
server.registerTool("get_import", { inputSchema: { id } }, async (p) =>
  output(await call(`imports/${p.id}`)),
);
server.registerTool(
  "list_candidates",
  {
    inputSchema: {
      status: z.enum(["pending", "approved", "rejected"]),
      page: id,
    },
  },
  async (p) =>
    output(await call(`candidates?status=${p.status}&page=${p.page}`)),
);
server.registerTool("get_candidate", { inputSchema: { id } }, async (p) =>
  output(await call(`candidates/${p.id}`)),
);
server.registerTool(
  "list_evaluation_workspaces",
  { inputSchema: {} },
  async () => output(await call("evaluation-workspaces")),
);
server.registerTool(
  "start_evaluation",
  {
    description: "Submit billable evaluation tasks for an approved candidate.",
    inputSchema: {
      candidate_id: id,
      workspace_id: recordID,
      task_count: taskCount,
      max_credits: id.optional(),
      request_key: requestKey,
    },
  },
  async (p) =>
    output(await call(p.max_credits ? "evaluations/capped" : "evaluations", p)),
);
const evaluationResult = {
  candidate_id: id.describe("Candidate ID from the evaluation report."),
  task_id: recordID.max(64).describe("Successful task ID from get_report."),
};
const editPath = (candidateId: number, taskId: string) =>
  `candidates/${candidateId}/results/${taskId}/edit`;

server.registerTool(
  "get_evaluation_edit_draft",
  {
    description:
      "Read a successful result's reference video, ordered input images, original prompt, model settings, workspace and current credit estimate for one edited variant.",
    inputSchema: evaluationResult,
  },
  async ({ candidate_id, task_id }) =>
    output(await call(editPath(candidate_id, task_id))),
);
server.registerTool(
  "list_test_asset_categories",
  {
    description: "List categories with approved Recast test assets.",
    inputSchema: {},
  },
  async () => output(await call("test-asset-categories?status=approved")),
);
server.registerTool(
  "list_test_assets",
  {
    description:
      "Browse approved Recast test assets by category. Use the returned asset ID as catalog_id when adding or replacing an image.",
    inputSchema: {
      category_id: id,
      page: id.default(1),
    },
  },
  async ({ category_id, page }) =>
    output(
      await call(
        `test-asset-categories/${category_id}/assets?status=approved&page=${page}&page_size=24`,
      ),
    ),
);

const originalIndex = z.number().int().nonnegative().max(29);
const evaluationImage = z.union([
  z.strictObject({
    original_index: originalIndex.describe("Zero-based index from the draft."),
  }),
  z.strictObject({
    catalog_id: id.describe("Approved test asset ID."),
    replaces_original_index: originalIndex
      .optional()
      .describe(
        "Transfer references from this zero-based draft index to the replacement.",
      ),
  }),
]);

server.registerTool(
  "start_edited_evaluation",
  {
    description:
      "Queue exactly one billable variant of a successful evaluation. Get the draft first and use the approved credit limit. Send the complete final image list in order, using original indexes and approved catalog IDs. Omit prompt to renumber existing image references automatically. Provide an updated prompt if a removed image was referenced.",
    inputSchema: {
      ...evaluationResult,
      images: z
        .array(evaluationImage)
        .max(30)
        .describe(
          "Final ordered images. Omit an original to remove it, or send an empty list for a prompt-only variant.",
        ),
      prompt: z
        .string()
        .trim()
        .min(1)
        .max(4000)
        .optional()
        .describe(
          "Optional edited prompt. Numbered image references use one-based positions in the final list.",
        ),
      max_credits: id,
      request_key: z
        .uuidv4()
        .describe(
          "Fresh UUID v4 for a new edit. Reuse the same UUID and inputs when retrying that submission.",
        ),
    },
  },
  async ({ candidate_id, task_id, ...edit }) =>
    output(await call(editPath(candidate_id, task_id), edit)),
);

server.registerTool("get_report", { inputSchema: { id } }, async (p) =>
  output(await call(`evaluations/${p.id}`)),
);
server.registerTool(
  "retry_evaluation_item",
  {
    description: "Retry one failed slot. A new generation may incur credits.",
    inputSchema: { id, slot: z.number().int().min(1).max(5) },
  },
  async (p) =>
    output(await call(`evaluations/${p.id}/items/${p.slot}/retry`, {})),
);
await server.connect(new StdioServerTransport());
