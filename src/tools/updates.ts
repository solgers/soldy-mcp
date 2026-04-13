import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { type ConnectionManager, TERMINAL_EVENTS } from "../connection.js";

export function registerUpdateTools(
  server: McpServer,
  connection: ConnectionManager,
) {
  server.tool(
    "get_updates",
    `Get new events for a project since a given cursor.

Use this to follow up after a chat() timeout, or after send_message() to check for results.

- With no cursor: returns all buffered events for the project.
- With a cursor (from a previous chat or get_updates call): returns only new events.
- With wait_seconds > 0: long-polls — waits up to that duration for new events before returning.

Returns events with a new cursor for subsequent calls.`,
    {
      project_id: z.string(),
      cursor: z
        .string()
        .optional()
        .describe("Cursor from a previous chat or get_updates call"),
      wait_seconds: z
        .number()
        .optional()
        .describe(
          "Seconds to wait for new events (0 = immediate, default 0). Max 60.",
        ),
    },
    async ({ project_id, cursor, wait_seconds }) => {
      const waitMs = Math.min(wait_seconds ?? 0, 60) * 1000;

      try {
        const { events, cursor: newCursor } = await connection.getEventsSince(
          project_id,
          cursor,
          waitMs,
        );

        if (events.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No new events for project ${project_id}.\nCursor: ${newCursor}`,
              },
            ],
          };
        }

        const lines: string[] = [`${events.length} new event(s):\n`];

        let lastStatus: string | undefined;
        for (const entry of events) {
          const msg = entry.msg;
          const event = msg.event;

          let line = `[${event}]`;
          if (msg.message?.text) {
            const preview =
              msg.message.text.length > 150
                ? `${msg.message.text.slice(0, 150)}...`
                : msg.message.text;
            line += ` ${preview}`;
          }
          if (msg.message?.tool?.name) {
            line += ` (tool: ${msg.message.tool.name})`;
          }
          if (msg.message?.materials?.length) {
            line += ` [${msg.message.materials.length} material(s)]`;
            for (const m of msg.message.materials) {
              lines.push(`  [${m.type}] ${m.url}`);
            }
          }
          lines.push(line);

          if (TERMINAL_EVENTS.has(event)) {
            lastStatus = event;
          }
        }

        lines.push("");
        if (lastStatus) {
          lines.push(`Run ended: ${lastStatus}`);
        } else {
          lines.push("Run still in progress.");
        }
        lines.push(`Cursor: ${newCursor}`);

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to get updates: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
