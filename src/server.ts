import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SoldyAPIClient } from "./client.js";
import { registerGenerationTools } from "./tools/generation.js";
import { registerMarketingTools } from "./tools/marketing.js";
import { DEFAULT_WEB_URL } from "./web-links.js";

export function createServer(
  apiUrl: string,
  getApiKey: () => Promise<string>,
  webUrl = DEFAULT_WEB_URL,
  onUnauthorized?: () => Promise<void>,
): { server: McpServer } {
  const server = new McpServer(
    { name: "Soldy AI", version: "0.5.0" },
    {
      capabilities: { tools: {}, prompts: {} },
      instructions: SERVER_INSTRUCTIONS,
    },
  );

  const client = new SoldyAPIClient(apiUrl, getApiKey, onUnauthorized);

  // Tools
  registerGenerationTools(server, client);
  registerMarketingTools(server, client, webUrl);

  // Workflow prompt — template-driven one-shot Video Ad generation.
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

  return { server };
}

// ---------------------------------------------------------------------------
// Server-level instructions
// ---------------------------------------------------------------------------
const SERVER_INSTRUCTIONS = `# Soldy AI MCP Server

Two ways to create content, both one-shot direct renders — no conversational
agent, no projects. Pick the one that matches the user's intent.

## Quick Create (\`video_*\` / \`image_*\`)

Provider-agnostic direct generation from a prompt + optional references.
\`video_*\` exposes Seedance 2.0, Seedance 2.0 Fast, Seedance 2.0 Mini, and
Kling 2.6 through the API model registry; \`image_*\` exposes GPT Image 2 and
the Gemini "Nano Banana" image models (Nano Banana Pro, Nano Banana 2). The
registry is the source of truth — call \`video_list_models\` /
\`image_list_models\` for the live set rather than hard-coding ids.

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
registry-owned values through.

## Marketing Studio (\`seedance_generate\`)

Template-driven Video Ad generation (UGC, Tutorial, Unboxing, Product Review,
TV Spot, Hyper Motion, Wild Card, Virtual Try On). One call, returns a public
read-only share page.

\`\`\`
list_video_ad_templates() → the module catalog with descriptions
seedance_generate({ prompt, module, image_url, ... }) → { task_id, share_url }
get_seedance_task(task_id) → status + result + share URL
\`\`\`

## Tools

| Tool | Path | Use case |
|------|------|----------|
| \`video_list_models\` / \`image_list_models\` | Quick Create | Discover generation model capabilities |
| \`video_generate\` / \`image_generate\` | Quick Create | Submit direct video/image generation tasks |
| \`video_get_task\` / \`image_get_task\` | Quick Create | Poll direct generation tasks |
| \`video_list_tasks\` / \`image_list_tasks\` | Quick Create | Browse direct generation history |
| \`video_retry_task\` / \`image_retry_task\` | Quick Create | Retry terminal direct generation tasks |
| \`video_delete_task\` / \`image_delete_task\` | Quick Create | Delete terminal direct generation tasks |
| \`video_get_lineage\` / \`image_get_lineage\` | Quick Create | Trace a task's input/output lineage |
| \`list_video_ad_templates\` | Marketing Studio | Discover the module template catalog |
| \`seedance_generate\` | Marketing Studio | Submit a template Video Ad render |
| \`get_seedance_task\` | Marketing Studio | Poll a Video Ad task |
| \`get_seedance_share_link\` | Marketing Studio | Public read-only share URL for a task |
| \`list_seedance_history\` | Marketing Studio | Browse Video Ad render history |

## Prompts

- \`video_ads_workflow\` — template-driven one-shot Video Ads (Marketing Studio).
`;

const VIDEO_ADS_WORKFLOW_PROMPT = `# Video Ads / Marketing Studio (template path)

Template-driven, deterministic, one-shot video ad generation through
\`seedance_generate\`. If the user wants a non-template direct render, use
\`video_list_models\` / \`video_generate\` (or \`image_*\`) instead.

## When to take this path

The user has already picked the format and just wants it rendered:

- "Make me a **UGC** ad for this product image."
- "I want an **unboxing** video using this photo."
- "Generate a **product review** video, 9:16, 15 seconds."
- "Render a **tutorial** style clip."
- "Just run this prompt with the **TV Spot** template."

One call to \`seedance_generate\` is enough. For Kling 2.6 or provider-agnostic
Seedance/Gemini/GPT Image 2 requests, use the Quick Create \`video_*\` /
\`image_*\` tools instead.

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

- Don't invent template values. The \`module\` enum is closed; if you're not
  sure, call \`list_video_ad_templates\`.
- Don't strip the \`id\` off material-library refs — pass them through so the
  backend can resolve the original asset.`;
