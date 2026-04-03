import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SoldyAPIClient } from "../client.js";

export function registerProjectResources(
  server: McpServer,
  client: SoldyAPIClient,
) {
  server.resource(
    "project-status",
    new ResourceTemplate("soldy://project/{project_id}/status", {
      list: async () => {
        try {
          const projects = await client.listProjects();
          return {
            resources: projects.map((p) => ({
              uri: `soldy://project/${p.id}/status`,
              name: `${p.name} — Status`,
              description: `Status: ${p.status} | Ratio: ${p.ratio}`,
              mimeType: "application/json",
            })),
          };
        } catch (err) {
          console.error("[resource:project-status] list failed:", err);
          return { resources: [] };
        }
      },
      complete: {
        project_id: async (value) => {
          try {
            const projects = await client.listProjects();
            return projects
              .filter((p) => p.id.startsWith(value))
              .map((p) => p.id);
          } catch {
            return [];
          }
        },
      },
    }),
    {
      title: "Project Status",
      description: "Current status of a project",
      mimeType: "application/json",
    },
    async (uri, { project_id }) => {
      const id = Array.isArray(project_id) ? project_id[0] : project_id;
      try {
        const project = await client.getProject(id);
        if (!project) {
          return {
            contents: [
              {
                uri: uri.href,
                mimeType: "application/json",
                text: JSON.stringify({ error: "Project not found" }),
              },
            ],
          };
        }
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(project, null, 2),
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
