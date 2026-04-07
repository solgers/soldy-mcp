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

const WORKFLOW_PROMPT = `# Working with Soldy

Soldy is a **conversational creative agent**, not a one-shot job runner. A Soldy
*project* is a *conversation*. You and the user talk to Soldy over multiple turns,
just like you would talk to a human creative director — they propose, you react,
they refine. Brands are persistent memory the conversation can lean on. Iteration
is the default, not an exception.

The single most important rule: **don't dump the user's first sentence into
send_message and walk away.** That is the equivalent of forwarding a one-line
email to a creative agency and expecting a finished commercial back. It is not
how Soldy is designed to be used.

## Mental model

- send_message is a *turn in a conversation*, not "submit job". Multiple turns
  per project is the normal case — the project accumulates brand, references,
  locked direction, and prior shots across every turn.
- Soldy will sometimes pause and ask for things: credits, an A/B/C creative
  pick, an approval gate. When project status is "pause", Soldy is waiting on
  the **user**, not on you. Surface the question; do not invent an answer.
- Generation takes minutes, not seconds. Use watch_project / watch_brand_task
  if your client supports subscriptions; otherwise poll every 5–10 seconds.
  Either way, keep the user informed while you wait.
- Iterate in place. If the user wants the music changed or shot 3 redone, send
  another message to the same project. Never create a new project to "fix"
  something — you lose the brand, the color bible, the storyboard, and the
  characters.

## Pick the depth that fits the user

The right interaction depth depends on what the user said, not on a fixed
checklist. Read the signals:

- **Vague** ("make me an ad for my coffee shop") → guide them. Offer to
  extract their brand if they have a URL. Ask the questions a creative
  director would ask: platform, length, tone, what the ad should *do*. Bring
  proposals back to the user before committing.
- **Concrete** ("15s 9:16 comedic ad for product X, here is brand_id and the
  photo") → fast-path. One well-formed send_message and watch.
- **Reference-driven** ("animate this image") → use Seedance mode directly:
  send_message with input_mode: "seedance" + seedance_reference_url. This
  skips creative direction entirely and is the right call for "animate this"
  intents.
- **Mid-conversation refinement** → translate the user's feedback into an
  iteration message on the same project. Don't restart.

## Tool quick reference

- Brand memory: extract_brand → watch_brand_task → reuse brand_id forever.
- Project lifecycle: create_project, list_projects, get_project.
- Conversation: send_message (ratio is required; pass brand_id when a brand
  exists; use input_mode "seedance" for direct image-to-video).
- Monitoring: watch_project (preferred) or get_project_status (poll fallback);
  get_project_materials when ready.
- Control: pause_project, continue_project, stop_project. Note: Soldy itself
  may put a project into "pause" — that's a *user* decision point, not a
  control you should auto-resolve.

## Boundaries

- Don't treat send_message as a one-shot job.
- Don't auto-resolve Soldy's pauses without the user.
- Don't restart projects to fix them — iterate.
- Don't expect Soldy to auto-extract product URLs from message text. Call
  extract_brand explicitly.
- Don't write shot-by-shot prompts. Describe outcomes; Soldy handles
  cinematography.`;
