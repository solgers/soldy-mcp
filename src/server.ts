import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  SubscribeRequestSchema,
  UnsubscribeRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { SoldyAPIClient } from "./client.js";
import { registerBrandResources } from "./resources/brands.js";
import { registerMaterialResources } from "./resources/materials.js";
import { registerMessageResources } from "./resources/messages.js";
import { registerProjectResources } from "./resources/projects.js";
import {
  extractBrandTaskId,
  extractProjectId,
  SubscriptionBridge,
} from "./subscriptions.js";
import { registerBrandTools } from "./tools/brand.js";
import { registerMaterialTools } from "./tools/material.js";
import { registerMessageTools } from "./tools/message.js";
import { registerProjectTools } from "./tools/project.js";
import { registerSubscribeTools } from "./tools/subscribe.js";

export function createServer(
  apiUrl: string,
  apiKey: string,
): { server: McpServer; bridge: SubscriptionBridge } {
  const server = new McpServer(
    { name: "Soldy AI", version: "0.1.0" },
    {
      capabilities: { tools: {}, prompts: {}, resources: { subscribe: true } },
      instructions: SERVER_INSTRUCTIONS,
    },
  );

  const client = new SoldyAPIClient(apiUrl, apiKey);
  const bridge = new SubscriptionBridge(client, apiUrl, apiKey);

  // Tools
  registerBrandTools(server, client);
  registerProjectTools(server, client);
  registerMessageTools(server, client);
  registerMaterialTools(server, apiUrl);
  registerSubscribeTools(server, bridge);

  // Resources
  registerBrandResources(server, client);
  registerProjectResources(server, client);
  registerMessageResources(server, client);
  registerMaterialResources(server, client);

  // Standard MCP resources/subscribe & resources/unsubscribe handlers.
  // McpServer does not register these automatically — only list/read are
  // wired up by the high-level API. We register on the low-level Server
  // instance so clients can use the standard subscription protocol.
  server.server.setRequestHandler(SubscribeRequestSchema, async (request) => {
    const uri = request.params.uri;

    const projectId = extractProjectId(uri);
    if (projectId) {
      await bridge.subscribeProject(projectId);
      return {};
    }

    const taskId = extractBrandTaskId(uri);
    if (taskId) {
      bridge.subscribeBrandTask(taskId);
      return {};
    }

    // For other resources (soldy://brands, etc.), acknowledge silently
    return {};
  });

  server.server.setRequestHandler(UnsubscribeRequestSchema, async (request) => {
    const uri = request.params.uri;

    const projectId = extractProjectId(uri);
    if (projectId) {
      bridge.unsubscribeProject(projectId);
      return {};
    }

    const taskId = extractBrandTaskId(uri);
    if (taskId) {
      bridge.unsubscribeBrandTask(taskId);
      return {};
    }

    return {};
  });

  // Workflow prompt
  server.prompt(
    "soldy_workflow",
    "Recommended workflow for creating video ads with Soldy",
    () => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: WORKFLOW_PROMPT,
          },
        },
      ],
    }),
  );

  return { server, bridge };
}

// ---------------------------------------------------------------------------
// Server-level instructions — injected into the MCP server metadata so agents
// always see them, regardless of which tools they discover first.
// ---------------------------------------------------------------------------
const SERVER_INSTRUCTIONS = `# Soldy AI MCP Server

## Available Resources (read & subscribe)

This server exposes MCP resources you can read and subscribe to for real-time updates.
Use resources instead of polling tools whenever possible.

### Resource URI Scheme

| URI | Description | Subscribable |
|-----|-------------|:---:|
| \`soldy://brands\` | All brands in the workspace | ✓ |
| \`soldy://brand/{brand_id}\` | Single brand detail | ✓ |
| \`soldy://brand/task/{task_id}\` | Brand extraction task status | ✓ |
| \`soldy://project/{project_id}/status\` | Project status | ✓ |
| \`soldy://project/{project_id}/messages\` | Conversation history | ✓ |
| \`soldy://project/{project_id}/materials\` | Generated assets (videos, images, etc.) | ✓ |
| \`soldy://project/{project_id}/runs/{run_id}/messages\` | Messages for a specific agent run | ✓ |
| \`soldy://project/{project_id}/runs/{run_id}/materials\` | Materials for a specific agent run | ✓ |

### Subscription Pattern (preferred over polling)

Instead of calling get_project_status in a loop, subscribe for real-time push notifications:

1. Call \`watch_project(project_id)\` or \`watch_brand_task(task_id)\`
2. You will receive resource update notifications when data changes
3. Read the notified resource URI to get updated data

### Recommended Workflow

- **Brand extraction**: \`extract_brand\` → \`watch_brand_task\` → wait for notification → read \`soldy://brand/task/{task_id}\`
- **Video generation**: \`send_message\` → \`watch_project\` → wait for notifications → read \`soldy://project/{id}/status\` or \`soldy://project/{id}/materials\`

### Polling Fallback

If subscription is not available in your client, you can still use:
- \`get_project_status\` — check project status
- \`get_brand_task_result\` — check brand task status
- \`list_messages\` — get conversation history
- \`get_project_materials\` — get generated assets
`;

const WORKFLOW_PROMPT = `# Soldy Video Ad Workflow

## Quick Start (3 steps)
1. create_project → get project_id
2. send_message with your prompt + material_urls (product images/videos)
3. watch_project to subscribe → read resources when notified

## Full Workflow with Brand

### Step 1: Brand Setup (recommended for best results)
If the user provides a product URL or brand name:
- Use extract_brand with the product/brand URL to auto-extract brand identity
- Use watch_brand_task to subscribe for completion (preferred) or poll get_brand_task_result
- This gives the agent brand context (colors, tone, positioning)

If user already has brands: list_brands to find the right brand_id

### Step 2: Create Project
- create_project with a descriptive name

### Step 3: Send Message with Materials
- send_message with:
  - content: describe what to generate
  - ratio (required): "9:16" (TikTok/Reels/Shorts), "16:9" (YouTube), "1:1" (Instagram), "4:3", "3:4", "3:2", "2:3", "21:9" (ultra-wide)
  - material_urls: product images, videos (local paths auto-uploaded)
  - brand_id: the brand from step 1

### Step 4: Monitor Progress (prefer subscription over polling)
- **Preferred**: watch_project → wait for resource update notifications
- **Fallback**: get_project_status to poll status
- If status is "pause": agent needs credits or approval → use continue_project
- If status is "error": check the error, retry with send_message
- If status is "completed": proceed to step 5

### Step 5: Get Results
- Read resource: soldy://project/{id}/materials
- Or use tool: get_project_materials

### Step 6: Iterate
- send_message again to refine, change style, adjust duration, etc.

## Tips
- Always pass brand_id in send_message when a brand exists
- ratio is required in send_message — choose based on target platform
- Product URLs in text are NOT automatically extracted — use extract_brand explicitly
- Local file paths (./image.jpg, /path/to/video.mp4) are uploaded automatically
- Use watch_project / watch_brand_task for real-time updates instead of polling`;
