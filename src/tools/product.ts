import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ApiResponse, SoldyAPIClient } from "../client.js";
import { formatApiError } from "../errors.js";
import { resolveLocalFilePath } from "../files.js";

type TextContent = { type: "text"; text: string };
type ToolResult = { content: TextContent[]; isError?: boolean };

interface Product {
  id: string;
  name: string;
  slug: string;
  description: string;
  workspace_id: string;
  metadata?: Record<string, unknown> | null;
}

interface ProductDraft {
  success?: boolean;
  error?: string | null;
  product_name?: string;
  description?: string;
  image_urls?: string[];
  draft?: Record<string, unknown>;
  readiness?: Record<string, unknown>;
}

interface MaterialUpload {
  url?: string;
}

const PRODUCT_METADATA_SCHEMA = z
  .record(z.string(), z.unknown())
  .describe(
    "Product metadata fields accepted by Core API ProductMeta, such as price, currency, product_url, category, brand, availability, variants, specifications, tags, and selling_points. Do not put top-level name or description here.",
  );

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

function productMeta(
  metadata: Record<string, unknown> | undefined,
  imageUrls: string[] | undefined,
): Record<string, unknown> | undefined {
  const meta = metadata ? { ...metadata } : {};
  if (imageUrls !== undefined) {
    meta.media = imageUrls.map((url) => ({
      type: "image",
      url,
      tags: [],
      description: "",
    }));
  }
  return Object.keys(meta).length > 0 ? meta : undefined;
}

export function registerProductTools(
  server: McpServer,
  client: SoldyAPIClient,
): void {
  server.tool(
    "product_upload_images",
    "Upload local product image files to Soldy object storage. This tool only uploads bytes and returns durable URLs; it does not parse or create a product. Preserve the returned order and pass the URLs to product_create, product_update, or a generation tool.",
    {
      file_paths: z
        .array(z.string().min(1))
        .min(1)
        .max(9)
        .describe(
          "Local image paths visible to the MCP process. Relative paths and ~/... are supported. One to nine files.",
        ),
    },
    {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    async ({ file_paths }) => {
      const uploaded = await Promise.all(
        file_paths.map(async (rawPath) => {
          const filePath = resolveLocalFilePath(rawPath);
          const resp = await client.uploadFile<MaterialUpload>(
            "/public/material",
            filePath,
          );
          if (resp.code !== 0 || !resp.data?.url) {
            throw new Error(
              `Upload failed for ${rawPath}: ${formatApiError(resp)}`,
            );
          }
          return { file_path: rawPath, url: resp.data.url };
        }),
      );
      return jsonResult({
        images: uploaded,
        image_urls: uploaded.map((item) => item.url),
      });
    },
  );

  server.tool(
    "product_parse_url",
    "Parse one public product-detail URL into a product draft. This is read/analysis only: it does not create a product object. Review or amend the returned draft, then call product_create explicitly.",
    {
      product_url: z.string().url().describe("Public product-detail page URL."),
      workspace_id: z
        .string()
        .optional()
        .describe("Workspace override. Defaults to the first workspace."),
    },
    {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async ({ product_url, workspace_id }) => {
      const workspaceId =
        workspace_id ?? (await client.getDefaultWorkspaceId());
      const resp = await client.post<ProductDraft>(
        "/public/product/draft-from-images",
        {
          workspace_id: workspaceId,
          image_urls: [],
          product_url,
        },
      );
      if (resp.code !== 0 || !resp.data) return apiError(resp);
      if (resp.data.success === false) {
        return errorResult(resp.data.error ?? "Product URL parsing failed.", {
          draft: resp.data,
        });
      }
      return jsonResult(resp.data);
    },
  );

  server.tool(
    "product_create",
    "Create one product-library object from explicit fields. Uploading and URL parsing are separate operations: pass image URLs from product_upload_images or draft fields from product_parse_url when desired.",
    {
      name: z.string().trim().min(1).describe("Product display name."),
      description: z.string().optional(),
      slug: z.string().optional(),
      workspace_id: z
        .string()
        .optional()
        .describe("Workspace override. Defaults to the first workspace."),
      image_urls: z
        .array(z.string().url())
        .max(20)
        .optional()
        .describe(
          "Product image URLs. They are stored as image entries in metadata.media.",
        ),
      metadata: PRODUCT_METADATA_SCHEMA.optional(),
    },
    {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    async ({ name, description, slug, workspace_id, image_urls, metadata }) => {
      const workspaceId =
        workspace_id ?? (await client.getDefaultWorkspaceId());
      const resp = await client.post<Product>("/public/product", {
        workspace_id: workspaceId,
        name,
        description,
        slug,
        meta: productMeta(metadata, image_urls),
      });
      if (resp.code !== 0 || !resp.data) return apiError(resp);
      return jsonResult(resp.data);
    },
  );

  server.tool(
    "product_update",
    "Update one product-library object by ID. Only supplied, non-empty fields are merged by the Core API. When image_urls is supplied, it replaces the product's image media while preserving other media types.",
    {
      product_id: z.string().min(1),
      name: z.string().trim().min(1).optional(),
      description: z.string().optional(),
      slug: z.string().optional(),
      image_urls: z
        .array(z.string().url())
        .max(20)
        .optional()
        .describe(
          "Replacement product image URLs. Omit to preserve current images.",
        ),
      metadata: PRODUCT_METADATA_SCHEMA.optional(),
    },
    {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    async ({ product_id, name, description, slug, image_urls, metadata }) => {
      const resp = await client.put<Product>("/public/product", {
        id: product_id,
        name,
        description,
        slug,
        meta: productMeta(metadata, image_urls),
      });
      if (resp.code !== 0 || !resp.data) return apiError(resp);
      return jsonResult(resp.data);
    },
  );

  server.tool(
    "product_delete",
    "Delete one user-owned product-library object by ID. This is destructive and also removes its project and brand associations; call only after the user has clearly requested deletion.",
    {
      product_id: z.string().min(1),
    },
    {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    async ({ product_id }) => {
      const resp = await client.delete("/public/product", {
        params: { id: product_id },
      });
      if (resp.code !== 0) return apiError(resp);
      return jsonResult({ deleted: true, product_id });
    },
  );
}
