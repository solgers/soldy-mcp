import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SoldyAPIClient } from "./client.js";
import { ConnectionManager } from "./connection.js";
import { registerBrandResources } from "./resources/brands.js";
import { registerMaterialResources } from "./resources/materials.js";
import { registerMessageResources } from "./resources/messages.js";
import { registerProjectResources } from "./resources/projects.js";
import { registerBrandTools } from "./tools/brand.js";
import { registerChatTools } from "./tools/chat.js";
import { registerMaterialTools } from "./tools/material.js";
import { registerMessageTools } from "./tools/message.js";
import { registerProjectTools } from "./tools/project.js";
import { registerStandaloneTools } from "./tools/standalone.js";
import { registerUpdateTools } from "./tools/updates.js";
import { registerWorkflowTools } from "./tools/workflows.js";

export function createServer(
  apiUrl: string,
  apiKey: string,
): { server: McpServer; connection: ConnectionManager } {
  const server = new McpServer(
    { name: "Soldy AI", version: "0.3.0" },
    {
      capabilities: { tools: {}, prompts: {}, resources: {} },
      instructions: SERVER_INSTRUCTIONS,
    },
  );

  const client = new SoldyAPIClient(apiUrl, apiKey);
  const connection = new ConnectionManager(client, apiKey);

  // Tools
  registerBrandTools(server, client);
  registerProjectTools(server, client);
  registerMessageTools(server, client);
  registerMaterialTools(server, apiUrl);
  registerChatTools(server, client, connection);
  registerUpdateTools(server, connection);
  registerWorkflowTools(server, client);
  registerStandaloneTools(server, client);

  // Resources (read-only)
  registerBrandResources(server, client);
  registerProjectResources(server, client);
  registerMessageResources(server, client);
  registerMaterialResources(server, client);

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

  return { server, connection };
}

// ---------------------------------------------------------------------------
// Server-level instructions
// ---------------------------------------------------------------------------
const SERVER_INSTRUCTIONS = `# Soldy AI MCP Server

## Primary Workflow: \`chat\`

The \`chat\` tool is the main way to interact with Soldy. It sends a message and
waits for the complete agent response in a single call.

\`\`\`
chat(project_id, message, ratio) → { status, messages, materials, cursor }
\`\`\`

The call blocks until the agent run completes, pauses, is cancelled, errors, or times out.

### After \`chat\`

- **completed**: The response contains all messages and generated materials. If
  \`follow_up_questions\` are present, surface them to the user as suggested next steps.
- **paused**: The agent needs user input (credits, approval, A/B choice). Show
  the pause reason / cost / pending tool to the user, then call \`continue_project\` when ready.
- **cancelled**: The run was stopped by user/system. No further action needed.
- **error**: Something went wrong. Check error_message.
- **timeout**: Generation is still running. Call \`get_updates(project_id, cursor)\`
  to check for new results.

### Advanced \`chat\` params (optional)

- \`workflow\`: pin to one of brand_dna / product / character / visual_hooks /
  product_highlights / story_creative / campaign_planning.
- \`entry_template_id\`: showcase entry-card id (e.g. "storyboard-grid").
- \`intent_answers\`: confirmed picks from clarify_intent cards. Outer key
  is the \`answers_key\` (e.g. \`creative_brief\`, \`video_engine_pick\`);
  inner map is \`question.key → chosen value\`.
- \`should_remind\` / \`large_consume_agreed\`: opt out of large-consumption
  reminders or pre-acknowledge cost so the agent does not pause.

## Other Tools

| Tool | Use case |
|------|----------|
| \`send_message\` | Fire-and-forget alternative to \`chat\` (doesn't wait for response) |
| \`get_updates\` | Get new events since a cursor (follow-up after timeout or send_message) |
| \`extract_brand\` | Extract brand identity from URL (blocks until done by default) |
| \`get_project_status\` | Quick status check |
| \`list_messages\` | Full conversation history |
| \`get_project_materials\` | All generated assets |

## Resources (read-only)

| URI | Description |
|-----|-------------|
| \`soldy://brands\` | All brands |
| \`soldy://brand/{brand_id}\` | Single brand |
| \`soldy://brand/task/{task_id}\` | Brand task status |
| \`soldy://project/{project_id}/status\` | Project status |
| \`soldy://project/{project_id}/messages\` | Conversation history |
| \`soldy://project/{project_id}/materials\` | Generated assets |
`;

const WORKFLOW_PROMPT = `# Working with Soldy

Soldy is a **conversational creative agent**, not a one-shot job runner. A Soldy
*project* is a *conversation*. You and the user talk to Soldy over multiple turns,
just like you would talk to a human creative director — they propose, you react,
they refine. Brands are persistent memory the conversation can lean on. Iteration
is the default, not an exception.

The single most important rule: **don't dump the user's first sentence into
chat and walk away.** That is the equivalent of forwarding a one-line
email to a creative agency and expecting a finished commercial back. It is not
how Soldy is designed to be used.

## Mental model

- \`chat\` is a *turn in a conversation*, not "submit job". Multiple turns
  per project is the normal case — the project accumulates brand, references,
  locked direction, and prior shots across every turn.
- Soldy will sometimes pause and ask for things: credits, an A/B/C creative
  pick, an approval gate. When the chat response status is "paused", Soldy is
  waiting on the **user**, not on you. Surface the question; do not invent an
  answer.
- Generation takes minutes, not seconds. The \`chat\` tool handles waiting
  automatically (default 5 minute timeout). If it times out, use \`get_updates\`
  with the cursor to check for new results.
- Iterate in place. If the user wants the music changed or shot 3 redone, send
  another message to the same project via \`chat\`. Never create a new project to
  "fix" something — you lose the brand, the look reference, the storyboard, and the
  characters.

## Pick the depth that fits the user

The right interaction depth depends on what the user said, not on a fixed
checklist. Read the signals:

- **Vague** ("make me an ad for my coffee shop") → guide them. Offer to
  extract their brand if they have a URL. Ask the questions a creative
  director would ask: platform, length, tone, what the ad should *do*. Bring
  proposals back to the user before committing.
- **Concrete** ("15s 9:16 comedic ad for product X, here is brand_id and the
  photo") → fast-path. One well-formed \`chat\` call.
- **Reference-driven** ("animate this image") → use Seedance mode directly:
  \`chat\` with input_mode: "seedance" + seedance_reference_url. This
  skips creative direction entirely and is the right call for "animate this"
  intents.
- **Mid-conversation refinement** → translate the user's feedback into an
  iteration message on the same project via \`chat\`. Don't restart.

## Tool quick reference

- Brand memory: \`extract_brand\` (blocks until done by default) → reuse brand_id forever.
- Project lifecycle: \`create_project\`, \`list_projects\`, \`get_project\`.
- Conversation: \`chat\` (primary — sends message + waits for response).
  Ratio is required; pass brand_id when a brand exists; use input_mode
  "seedance" for direct image-to-video.
- Fire-and-forget: \`send_message\` + \`get_updates\` for async workflows.
- Control: \`pause_project\`, \`continue_project\`, \`stop_project\`. Note: Soldy
  itself may put a project into "pause" — that's a *user* decision point, not a
  control you should auto-resolve.

## Boundaries

- Don't treat \`chat\` as a one-shot job.
- Don't auto-resolve Soldy's pauses without the user.
- Don't restart projects to fix them — iterate.
- Don't expect Soldy to auto-extract product URLs from message text. Call
  \`extract_brand\` explicitly.
- Don't write shot-by-shot prompts. Describe outcomes; Soldy handles
  cinematography.`;
