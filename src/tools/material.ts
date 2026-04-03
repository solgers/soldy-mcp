import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerMaterialTools(server: McpServer, apiUrl: string) {
  server.tool(
    "upload_material",
    "Returns HTTP upload endpoint for local file upload. Note: send_message handles local files automatically — you usually don't need this.",
    {},
    async () => {
      return {
        content: [
          {
            type: "text" as const,
            text: `## File Upload

send_message automatically handles local file paths — just pass them as material_urls.

For manual upload, POST multipart/form-data to:
${apiUrl}/api/v1/public/material

Header: X-API-Key: <your-key>
Field: file (required)

The response contains a URL to use in send_message's material_urls.`,
          },
        ],
      };
    },
  );
}
