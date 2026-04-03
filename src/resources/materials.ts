import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SoldyAPIClient } from "../client.js";

export function registerMaterialResources(
  server: McpServer,
  client: SoldyAPIClient,
) {
  server.resource(
    "project-materials",
    new ResourceTemplate("soldy://project/{project_id}/materials", {
      list: async () => {
        try {
          const projects = await client.listProjects();
          return {
            resources: projects.map((p) => ({
              uri: `soldy://project/${p.id}/materials`,
              name: `${p.name} — Materials`,
              description: `Generated assets for ${p.name}`,
              mimeType: "application/json",
            })),
          };
        } catch (err) {
          console.error("[resource:project-materials] list failed:", err);
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
      title: "Project Materials",
      description: "All generated assets for a project",
      mimeType: "application/json",
    },
    async (uri, { project_id }) => {
      const id = Array.isArray(project_id) ? project_id[0] : project_id;
      try {
        const materials = await client.getMaterials(id);
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(
                { count: materials.length, materials },
                null,
                2,
              ),
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
    "run-materials",
    new ResourceTemplate(
      "soldy://project/{project_id}/runs/{run_id}/materials",
      {
        list: undefined,
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
          run_id: async (value, context) => {
            try {
              const projectId = context?.arguments?.project_id;
              if (!projectId) return [];
              const groups = await client.getMaterialsGrouped(projectId);
              return groups
                .map((g) => g.run_id)
                .filter((r): r is string => Boolean(r) && r.startsWith(value));
            } catch {
              return [];
            }
          },
        },
      },
    ),
    {
      title: "Run Materials",
      description:
        "Generated assets for a specific agent run. Use project-level materials to discover run_ids first.",
      mimeType: "application/json",
    },
    async (uri, { project_id, run_id }) => {
      const pid = Array.isArray(project_id) ? project_id[0] : project_id;
      const rid = Array.isArray(run_id) ? run_id[0] : run_id;
      try {
        const groups = await client.getMaterialsGrouped(pid);
        const match = groups.find((g) => g.run_id === rid);
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(
                {
                  run_id: rid,
                  count: match?.materials.length ?? 0,
                  materials: match?.materials ?? [],
                },
                null,
                2,
              ),
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
