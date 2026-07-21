import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ApiResponse, SoldyAPIClient } from "../client.js";
import { formatApiError } from "../errors.js";
import { resolveLocalFilePath } from "../files.js";

type TextContent = { type: "text"; text: string };
type ToolResult = { content: TextContent[]; isError?: boolean };

interface Avatar {
  id: string;
  name: string;
  description: string;
  source: "user" | "system";
  slug?: string;
  original_filename?: string;
  workspace_id?: string;
  project_id?: string;
  media_type: string;
  gcs_url: string[];
  thumbnail_url?: string;
  volcan_sync_status?: string;
}

function jsonResult(value: unknown): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
  };
}

function errorResult(message: string, details?: unknown): ToolResult {
  const suffix =
    details === undefined ? "" : `\n${JSON.stringify(details, null, 2)}`;
  return {
    content: [{ type: "text", text: `${message}${suffix}` }],
    isError: true,
  };
}

function apiError(resp: ApiResponse, details?: unknown): ToolResult {
  return errorResult(formatApiError(resp), details);
}

function primaryUrl(avatar: Avatar): string | undefined {
  return avatar.gcs_url.find((url) => url.trim().length > 0);
}

function selection(
  avatar: Avatar,
): { avatar: Avatar; reference: { id: string; url: string } } | undefined {
  const url = primaryUrl(avatar);
  if (!url) return undefined;
  return {
    avatar,
    reference: { id: avatar.id, url },
  };
}

function matchesQuery(avatar: Avatar, normalizedQuery: string): boolean {
  if (!normalizedQuery) return true;
  return [
    avatar.id,
    avatar.name,
    avatar.description,
    avatar.slug,
    avatar.original_filename,
  ].some(
    (value) =>
      typeof value === "string" &&
      value.toLocaleLowerCase().includes(normalizedQuery),
  );
}

export function registerAvatarTools(
  server: McpServer,
  client: SoldyAPIClient,
): void {
  server.tool(
    "avatar_search",
    "Search or browse selectable avatars. Results include globally shared system avatars and user avatars visible to the organization. This is read-only and does not persist UI selection; call avatar_select with an ID to retrieve the exact generation reference.",
    {
      query: z
        .string()
        .optional()
        .describe(
          "Case-insensitive match across id, name, description, slug, and original filename. Omit to browse.",
        ),
      source: z.enum(["user", "system"]).optional(),
      workspace_id: z
        .string()
        .optional()
        .describe(
          "Filter user avatars by workspace. System avatars remain visible, matching the Soldy picker.",
        ),
      project_id: z
        .string()
        .optional()
        .describe(
          "Filter user avatars by project. System avatars remain visible.",
        ),
      limit: z.number().int().min(1).max(100).optional().default(20),
    },
    {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async ({ query, source, workspace_id, project_id, limit }) => {
      const normalizedQuery = query?.trim().toLocaleLowerCase() ?? "";
      const matches: Avatar[] = [];
      let scanned = 0;
      let page = 1;
      let totalAvailable = 0;
      const pageSize = 100;
      const maxPages = 10;

      while (page <= maxPages && matches.length < limit) {
        const params: Record<string, string> = {
          page: String(page),
          page_size: String(pageSize),
        };
        if (workspace_id) params.workspace_id = workspace_id;
        if (project_id) params.project_id = project_id;

        const resp = await client.get<Avatar[]>("/public/avatar/list", params);
        if (resp.code !== 0) return apiError(resp);
        const items = resp.data ?? [];
        totalAvailable = resp.page?.total_count ?? items.length;
        scanned += items.length;

        for (const avatar of items) {
          if (source && avatar.source !== source) continue;
          if (!matchesQuery(avatar, normalizedQuery)) continue;
          matches.push(avatar);
          if (matches.length === limit) break;
        }

        if (items.length < pageSize || scanned >= totalAvailable) break;
        page += 1;
      }

      return jsonResult({
        items: matches,
        match_count: matches.length,
        scanned_count: scanned,
        total_available: totalAvailable,
        truncated:
          scanned < totalAvailable ||
          (matches.length === limit && totalAvailable > matches.length),
      });
    },
  );

  server.tool(
    "avatar_select",
    "Select an avatar for reuse by retrieving its exact current record. Returns `reference: { id, url }`, which can be passed directly as an item in seedance_generate.image_url. This tool is read-only; it does not write UI selection state.",
    {
      avatar_id: z.string().min(1),
    },
    {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async ({ avatar_id }) => {
      const resp = await client.get<Avatar>("/public/avatar", {
        id: avatar_id,
      });
      if (resp.code !== 0 || !resp.data) return apiError(resp);
      const selected = selection(resp.data);
      if (!selected) {
        return errorResult(`Avatar ${avatar_id} has no usable image URL.`);
      }
      return jsonResult(selected);
    },
  );

  server.tool(
    "avatar_upload",
    "Upload one local avatar image and create a user avatar object in a single atomic API operation. The response includes a generation-ready `reference: { id, url }`. Use product_upload_images instead for product images.",
    {
      file_path: z
        .string()
        .min(1)
        .describe(
          "Local image path visible to the MCP process. Relative paths and ~/... are supported.",
        ),
      name: z.string().optional(),
      description: z.string().optional(),
      workspace_id: z
        .string()
        .optional()
        .describe("Workspace override. Defaults to the first workspace."),
      project_id: z.string().optional(),
    },
    {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    async ({ file_path, name, description, workspace_id, project_id }) => {
      const workspaceId =
        workspace_id ?? (await client.getDefaultWorkspaceId());
      const fields: Record<string, string> = {
        media_type: "image",
        workspace_id: workspaceId,
      };
      if (name) fields.name = name;
      if (description) fields.description = description;
      if (project_id) fields.project_id = project_id;

      const resp = await client.uploadFile<Avatar>(
        "/public/avatar",
        resolveLocalFilePath(file_path),
        fields,
      );
      if (resp.code !== 0 || !resp.data) {
        return apiError(
          resp,
          resp.data ? { persisted_avatar: resp.data } : undefined,
        );
      }
      const selected = selection(resp.data);
      if (!selected) {
        return errorResult(
          `Avatar ${resp.data.id} was created without a usable image URL.`,
          { avatar: resp.data },
        );
      }
      return jsonResult(selected);
    },
  );
}
