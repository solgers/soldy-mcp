import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SoldyAPIClient } from "../client.js";

export function registerMessageResources(
  server: McpServer,
  client: SoldyAPIClient,
) {
  server.resource(
    "project-messages",
    new ResourceTemplate("soldy://project/{project_id}/messages", {
      list: async () => {
        try {
          const projects = await client.listProjects();
          return {
            resources: projects.map((p) => ({
              uri: `soldy://project/${p.id}/messages`,
              name: `${p.name} — Messages`,
              description: `Conversation history for ${p.name}`,
              mimeType: "application/json",
            })),
          };
        } catch (err) {
          console.error("[resource:project-messages] list failed:", err);
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
      title: "Project Messages",
      description: "Conversation history for a project",
      mimeType: "application/json",
    },
    async (uri, { project_id }) => {
      const id = Array.isArray(project_id) ? project_id[0] : project_id;
      try {
        const { messages, total } = await client.listMessages(id);
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify({ total, messages }, null, 2),
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
    "run-messages",
    new ResourceTemplate(
      "soldy://project/{project_id}/runs/{run_id}/messages",
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
              const { messages } = await client.listMessages(projectId, 1, 100);
              const runIds = [
                ...new Set(messages.map((m) => m.run_id).filter(Boolean)),
              ];
              return runIds.filter((r) => r.startsWith(value));
            } catch {
              return [];
            }
          },
        },
      },
    ),
    {
      title: "Run Messages",
      description:
        "Messages for a specific agent run. Use project-level messages to discover run_ids first.",
      mimeType: "application/json",
    },
    async (uri, { project_id, run_id }) => {
      const pid = Array.isArray(project_id) ? project_id[0] : project_id;
      const rid = Array.isArray(run_id) ? run_id[0] : run_id;
      try {
        const { messages } = await client.listMessages(pid, 1, 200);
        const runMessages = messages.filter((m) => m.run_id === rid);
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(
                {
                  run_id: rid,
                  count: runMessages.length,
                  messages: runMessages,
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
