import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SoldyAPIClient } from "./client.js";
import { ConnectionManager } from "./connection.js";
import { registerBrandResources } from "./resources/brands.js";
import { registerMaterialResources } from "./resources/materials.js";
import { registerMessageResources } from "./resources/messages.js";
import { registerProjectResources } from "./resources/projects.js";
import { registerBrandTools } from "./tools/brand.js";
import { registerChatTools } from "./tools/chat.js";
import { registerGenerationTools } from "./tools/generation.js";
import { registerMaterialTools } from "./tools/material.js";
import { registerMessageTools } from "./tools/message.js";
import { registerProjectTools } from "./tools/project.js";
import { registerStandaloneTools } from "./tools/standalone.js";
import { registerUpdateTools } from "./tools/updates.js";
import { registerWorkflowTools } from "./tools/workflows.js";
import { DEFAULT_WEB_URL } from "./web-links.js";

export function createServer(
  apiUrl: string,
  apiKey: string,
  webUrl = DEFAULT_WEB_URL,
): { server: McpServer; connection: ConnectionManager } {
  const server = new McpServer(
    { name: "Soldy AI", version: "0.4.0" },
    {
      capabilities: { tools: {}, prompts: {}, resources: {} },
      instructions: SERVER_INSTRUCTIONS,
    },
  );

  const client = new SoldyAPIClient(apiUrl, apiKey);
  const connection = new ConnectionManager(client, apiKey);

  // Tools
  registerBrandTools(server, client);
  registerProjectTools(server, client, webUrl);
  registerMessageTools(server, client);
  registerMaterialTools(server, apiUrl);
  registerGenerationTools(server, client);
  registerChatTools(server, client, connection);
  registerUpdateTools(server, connection);
  registerWorkflowTools(server, client);
  registerStandaloneTools(server, client);

  // Resources (read-only)
  registerBrandResources(server, client);
  registerProjectResources(server, client);
  registerMessageResources(server, client);
  registerMaterialResources(server, client);

  // Workflow prompts — two peers, mirroring the two-path model in the
  // server instructions. Pick whichever matches the user's intent.
  server.prompt(
    "soldy_workflow",
    "Conversational creative direction with Soldy (multi-shot, brand-aware, iterative). For template-driven one-shot ads see video_ads_workflow.",
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

  server.prompt(
    "video_ads_workflow",
    "Template-driven Video Ad / Marketing Studio generation (UGC, Unboxing, Tutorial, …) — one call, no agent round-trip.",
    () => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: VIDEO_ADS_WORKFLOW_PROMPT,
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

## Two ways to create video content

Soldy exposes two first-class paths. Pick the one that matches the user's intent —
neither is "primary"; routing the wrong one wastes time on both sides.

### Path A — Conversational agent (\`chat\`)

Use when the user wants creative direction, brand-aware iteration, multi-shot
storyboarding, or any back-and-forth ("make me an ad for my coffee shop", "redo
shot 3 with a different hook", "draft a 3-act story for this brand").

\`\`\`
chat(project_id, message, ratio) → { status, messages, materials, cursor }
\`\`\`

\`chat\` sends a message and waits for the agent run to finish. It blocks until the
run completes, pauses, is cancelled, errors, or times out.

After \`chat\`:

- **completed**: response has all messages + generated materials. Surface any
  \`follow_up_questions\` as suggested next steps.
- **paused**: the agent needs user input (credits, approval, A/B choice).
  Surface pause reason / cost / pending tool, then call \`continue_project\`
  once the user has answered.
- **cancelled**: run was stopped. No further action needed.
- **error**: check \`error_message\`.
- **timeout**: generation is still running. Call \`get_updates(project_id, cursor)\`
  to check for new results.

Advanced params (optional): \`workflow\` (brand_dna / product / character /
visual_hooks / product_highlights / story_creative / campaign_planning),
\`entry_template_id\`, \`intent_answers\`, \`should_remind\`, \`large_consume_agreed\`.

### Path B — Unified quick generation (\`video_*\` / \`image_*\`)

Use when the user wants one direct render from a prompt + optional references,
without creative back-and-forth. This is the modern provider-agnostic path:
\`video_*\` exposes Seedance 2.0, Seedance 2.0 Fast, and Kling 2.6 through the
API model registry; \`image_*\` exposes GPT Image 2 and Gemini image models.

\`\`\`
video_list_models() → model registry + modes + parameters
video_generate({ model, mode, prompt, parameters, input_assets }) → { id }
video_get_task(task_id) → status + result
image_list_models() → model registry + modes + parameters
image_generate({ model, mode, prompt, parameters, input_assets }) → { id }
image_get_task(task_id) → status + result
\`\`\`

If you're not sure which \`model\`, \`mode\`, or parameter values match the
request, call \`video_list_models\` / \`image_list_models\` first and pass the
registry-owned values through. For old Marketing Studio template requests
(UGC, Tutorial, Unboxing, Product Review, TV Spot, Hyper Motion, Wild Card,
Virtual Try On), \`seedance_generate\` remains available as a compatibility
template wrapper and returns a public read-only share page.

**Don't default to \`chat\` for direct-render requests.** Phrases like "render
this image with Kling", "generate four product images", or "make a UGC ad" are
Path B, not Path A.

## Tools

| Tool | Path | Use case |
|------|------|----------|
| \`chat\` | A | Send a message + wait for agent response |
| \`send_message\` | A | Fire-and-forget alternative to \`chat\` |
| \`get_updates\` | A | New events since a cursor (after timeout or send_message) |
| \`continue_project\` / \`pause_project\` / \`stop_project\` | A | Run lifecycle control |
| \`video_list_models\` / \`image_list_models\` | B | Discover unified generation model capabilities |
| \`video_generate\` / \`image_generate\` | B | Submit direct video/image generation tasks |
| \`video_get_task\` / \`image_get_task\` | B | Poll direct generation tasks |
| \`video_list_tasks\` / \`image_list_tasks\` | B | Browse direct generation history |
| \`video_retry_task\` / \`image_retry_task\` | B | Retry terminal direct generation tasks |
| \`video_delete_task\` / \`image_delete_task\` | B | Delete terminal direct generation tasks |
| \`list_video_ad_templates\` / \`seedance_generate\` | B compatibility | Legacy Marketing Studio template path |
| \`extract_brand\` | shared | Brand extraction from URL |
| \`get_project_status\` / \`list_messages\` / \`get_project_materials\` | shared | Project introspection |

## Resources (read-only)

| URI | Description |
|-----|-------------|
| \`soldy://brands\` | All brands |
| \`soldy://brand/{brand_id}\` | Single brand |
| \`soldy://brand/task/{task_id}\` | Brand task status |
| \`soldy://project/{project_id}/status\` | Project status |
| \`soldy://project/{project_id}/messages\` | Conversation history |
| \`soldy://project/{project_id}/materials\` | Generated assets |

## Prompts

- \`soldy_workflow\` — conversational creative direction (Path A).
- \`video_ads_workflow\` — template-driven one-shot ads (Path B).
`;

const WORKFLOW_PROMPT = `# Conversational creative direction with Soldy

This prompt is for **Path A** — conversational, multi-shot, brand-aware
iteration. If the user just wants one direct render from a prompt + reference,
use the unified \`video_*\` / \`image_*\` tools instead. If they already picked
a Marketing Studio template (UGC, Unboxing, Tutorial, …), switch to the
\`video_ads_workflow\` prompt and use \`seedance_generate\` directly — it is a
peer path, not a fallback.

Soldy (Path A) is a **conversational creative agent**, not a one-shot job
runner. A Soldy *project* is a *conversation*. You and the user talk to Soldy
over multiple turns, just like you would talk to a human creative director —
they propose, you react, they refine. Brands are persistent memory the
conversation can lean on. Iteration is the default, not an exception.

The single most important rule for this path: **don't dump the user's first
sentence into \`chat\` and walk away.** That is the equivalent of forwarding a
one-line email to a creative agency and expecting a finished commercial back.

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
  photo") → one well-formed \`chat\` call.
- **Template-driven** ("make me a UGC ad / unboxing / tutorial for this
  product") → this is **Path B compatibility**. Switch to
  \`video_ads_workflow\` and call \`seedance_generate\` with the matching
  \`module\`. Do not route through \`chat\`.
- **Direct render, no creative iteration** ("animate this image with Kling",
  "generate four product shots") → use \`video_list_models\` /
  \`image_list_models\`, then \`video_generate\` / \`image_generate\`.
- **Mid-conversation refinement** → translate the user's feedback into an
  iteration message on the same project via \`chat\`. Don't restart.

## Tool quick reference

- Brand memory: \`extract_brand\` (blocks until done by default) → reuse brand_id forever.
- Project lifecycle: \`create_project\`, \`list_projects\`, \`get_project\`.
- Conversation: \`chat\` — sends message + waits for response. Ratio is required;
  pass brand_id when a brand exists.
- Fire-and-forget: \`send_message\` + \`get_updates\` for async workflows.
- Control: \`pause_project\`, \`continue_project\`, \`stop_project\`. Note: Soldy
  itself may put a project into "pause" — that's a *user* decision point, not a
  control you should auto-resolve.

## Boundaries

- Don't treat \`chat\` as a one-shot job. (For one-shot template ads, use Path B.)
- Don't auto-resolve Soldy's pauses without the user.
- Don't restart projects to fix them — iterate.
- Don't expect Soldy to auto-extract product URLs from message text. Call
  \`extract_brand\` explicitly.
- Don't write shot-by-shot prompts. Describe outcomes; Soldy handles
  cinematography.`;

const VIDEO_ADS_WORKFLOW_PROMPT = `# Video Ads / Marketing Studio (template path)

This prompt is for the **Marketing Studio template compatibility path** —
template-driven, deterministic, one-shot video ad generation through
\`seedance_generate\`. If the user wants a non-template direct render, use
\`video_list_models\` / \`video_generate\` instead. If the user wants creative
back-and-forth, brand-aware storyboarding, or multi-shot iteration, switch to
the \`soldy_workflow\` prompt and use \`chat\` instead. These paths are
first-class peers.

## When to take this path

The user has already picked the format and just wants it rendered:

- "Make me a **UGC** ad for this product image."
- "I want an **unboxing** video using this photo."
- "Generate a **product review** video, 9:16, 15 seconds."
- "Render a **tutorial** style clip."
- "Just run this prompt with the **TV Spot** template."

You do **not** need to create a project, extract a brand, or send a message
through the conversational agent for these. One call to \`seedance_generate\`
is enough. For Kling 2.6 or provider-agnostic Seedance/Gemini/GPT Image 2
requests, use the unified \`video_*\` / \`image_*\` tools instead.

## Procedure

1. **Confirm the template.** If the user named one (UGC / Tutorial / Unboxing
   / Hyper_Motion / Product_Review / TV_Spot / Wild_Card / UGC_Virtual_Try_On
   / Pro_Virtual_Try_On / Direct), use it. If they described a *style* but not
   a template name, call \`list_video_ad_templates\` to see the catalog and
   pick the closest match — surface 2–3 options to the user only when the
   match is genuinely ambiguous.

2. **Gather references.** Most templates expect a product image. Pass it via
   \`image_url\`. The argument accepts either:
   - plain URL strings: \`["https://…"]\`
   - or material-library refs: \`[{ url: "https://…", id: "mat_…" }]\`
     (use the \`id\` form when you got it from a Soldy material list).

3. **Submit.** Call \`seedance_generate\` with at minimum \`prompt\` and
   \`module\`. Optional: \`ratio\` (default 9:16), \`input_ratio\` (same
   allowed set as \`ratio\`; overrides \`ratio\` for downstream tooling
   when set), \`duration\` (4–15 seconds, default 10), \`resolution\`
   (480p / 720p / 1080p), \`model\`, \`video_url\`, \`audio_url\`. You
   get back a \`task_id\` and public share URL immediately.

4. **Poll.** Call \`get_seedance_task(task_id)\` until \`status\` is
   \`succeeded\` or \`failed\`. Generation typically takes 1–3 minutes — tell
   the user it's running. Surface the \`result\` JSON and share URL when done.

5. **Share.** If the user asks for a link, call
   \`get_seedance_share_link(task_id)\`. The page is read-only and matches the
   web product's shared Video Ads detail view.

6. **History.** Use \`list_seedance_history\` if the user asks "what have I
   rendered?". It includes the same share URLs.

## Boundaries

- Don't fall back to \`chat\` for template-mode requests just because it feels
  more "thorough". \`seedance_generate\` is the right tool for this intent —
  routing through the agent wastes minutes and credits.
- Don't invent template values. The \`module\` enum is closed; if you're not
  sure, call \`list_video_ad_templates\`.
- Don't strip the \`id\` off material-library refs — pass them through so the
  backend can resolve the original asset.`;
