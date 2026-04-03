import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SubscriptionBridge } from "../subscriptions.js";

/**
 * Registers subscription tools that expose MCP resource subscriptions
 * as discoverable tools for agents.
 *
 * Agents can only see tools in the tool list — MCP resources and their
 * subscribe capability are invisible at the tool level. These tools
 * bridge that gap by letting agents subscribe to real-time updates
 * instead of polling.
 */
export function registerSubscribeTools(
  server: McpServer,
  bridge: SubscriptionBridge,
) {
  server.tool(
    "watch_project",
    `Subscribe to real-time updates for a project. Returns immediately and pushes notifications when project status, messages, or materials change.

**Use this instead of polling get_project_status in a loop.** After calling watch_project, you will receive resource update notifications for:
- \`soldy://project/{project_id}/status\` — when status changes (running → completed, paused, error)
- \`soldy://project/{project_id}/messages\` — when new messages arrive
- \`soldy://project/{project_id}/materials\` — when new assets are generated
- \`soldy://project/{project_id}/runs/{run_id}/messages\` — per-run message updates
- \`soldy://project/{project_id}/runs/{run_id}/materials\` — per-run material updates

When you receive a notification, read the corresponding resource URI to get updated data.

Typical flow: send_message → watch_project → wait for notifications → read resources when notified.`,
    {
      project_id: z.string().describe("Project ID to watch for updates"),
    },
    async ({ project_id }) => {
      try {
        await bridge.subscribeProject(project_id);
        return {
          content: [
            {
              type: "text" as const,
              text: `Watching project \`${project_id}\`. You will receive resource update notifications when status, messages, or materials change.\n\nAvailable resource URIs:\n- soldy://project/${project_id}/status\n- soldy://project/${project_id}/messages\n- soldy://project/${project_id}/materials`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to watch project: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "watch_brand_task",
    `Subscribe to real-time updates for a brand extraction task. Returns immediately and pushes notifications when task status changes.

**Use this instead of polling get_brand_task_result in a loop.** After calling watch_brand_task, you will receive resource update notifications for:
- \`soldy://brand/task/{task_id}\` — when task progress or status changes (running → finished/failed)

When the task finishes, you will also receive notifications for:
- \`soldy://brands\` — brand list updated with newly extracted brand
- \`soldy://brand/{brand_id}\` — new brand details available

Polling automatically stops when the task completes or fails.

Typical flow: extract_brand → watch_brand_task → wait for notification → read resource to get brand_id.`,
    {
      task_id: z.string().describe("Brand extraction task ID to watch"),
    },
    async ({ task_id }) => {
      bridge.subscribeBrandTask(task_id);
      return {
        content: [
          {
            type: "text" as const,
            text: `Watching brand task \`${task_id}\`. You will receive a resource update notification when the extraction completes or fails.\n\nResource URI: soldy://brand/task/${task_id}`,
          },
        ],
      };
    },
  );
}
