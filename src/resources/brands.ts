import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SoldyAPIClient } from "../client.js";

export function registerBrandResources(
  server: McpServer,
  client: SoldyAPIClient,
) {
  server.resource(
    "brands",
    new ResourceTemplate("soldy://brands", {
      list: async () => ({
        resources: [
          {
            uri: "soldy://brands",
            name: "All Brands",
            description: "List of all brands in the workspace",
            mimeType: "application/json",
          },
        ],
      }),
    }),
    {
      title: "Brands",
      description: "All brands in the workspace",
      mimeType: "application/json",
    },
    async (uri) => {
      try {
        const brands = await client.listBrands();
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify({ count: brands.length, brands }, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify({
                error: err instanceof Error ? err.message : "Failed to fetch",
              }),
            },
          ],
        };
      }
    },
  );

  server.resource(
    "brand-detail",
    new ResourceTemplate("soldy://brand/{brand_id}", {
      list: async () => {
        try {
          const brands = await client.listBrands();
          return {
            resources: brands.map((b) => ({
              uri: `soldy://brand/${b.id}`,
              name: b.name,
              description: `Brand: ${b.name} (stage: ${b.stage})`,
              mimeType: "application/json",
            })),
          };
        } catch (err) {
          console.error("[resource:brand-detail] list failed:", err);
          return { resources: [] };
        }
      },
      complete: {
        brand_id: async (value) => {
          try {
            const brands = await client.listBrands();
            return brands
              .filter(
                (b) =>
                  b.id.startsWith(value) ||
                  b.name.toLowerCase().includes(value.toLowerCase()),
              )
              .map((b) => b.id);
          } catch {
            return [];
          }
        },
      },
    }),
    {
      title: "Brand Detail",
      description: "Details of a specific brand",
      mimeType: "application/json",
    },
    async (uri, { brand_id }) => {
      const id = Array.isArray(brand_id) ? brand_id[0] : brand_id;
      try {
        const brands = await client.listBrands();
        const brand = brands.find((b) => b.id === id);
        if (!brand) {
          return {
            contents: [
              {
                uri: uri.href,
                mimeType: "application/json",
                text: JSON.stringify({ error: "Brand not found" }),
              },
            ],
          };
        }
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(brand, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify({
                error: err instanceof Error ? err.message : "Failed to fetch",
              }),
            },
          ],
        };
      }
    },
  );

  server.resource(
    "brand-task",
    new ResourceTemplate("soldy://brand/task/{task_id}", {
      list: undefined,
      complete: {
        task_id: async () => [],
      },
    }),
    {
      title: "Brand Extraction Task",
      description:
        "Status and result of a brand extraction task. Subscribe for updates.",
      mimeType: "application/json",
    },
    async (uri, { task_id }) => {
      const id = Array.isArray(task_id) ? task_id[0] : task_id;
      try {
        const task = await client.getBrandTaskResult(id);
        if (!task) {
          return {
            contents: [
              {
                uri: uri.href,
                mimeType: "application/json",
                text: JSON.stringify({ error: "Task not found" }),
              },
            ],
          };
        }
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(task, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify({
                error: err instanceof Error ? err.message : "Failed to fetch",
              }),
            },
          ],
        };
      }
    },
  );
}
