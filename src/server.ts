import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SoldyAPIClient } from "./client.js";
import { registerAvatarTools } from "./tools/avatar.js";
import { registerGenerationTools } from "./tools/generation.js";
import { registerMarketingTools } from "./tools/marketing.js";
import { registerProductTools } from "./tools/product.js";
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
  registerProductTools(server, client);
  registerAvatarTools(server, client);

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
\`video_*\` exposes Seedance 2.0, Seedance 2.0 Fast, Seedance 2.0 Mini,
Kling 2.6, and MiniMax H3 through the API model registry; \`image_*\` exposes GPT Image 2 and
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
TV Spot, Hyper Motion, Wild Card, Virtual Try On). Returns a public read-only
share page.

**Options first — do not auto-pick.** For any "make me an ad" request, call
\`plan_video_ad\` and present the templates + parameters (aspect ratio,
duration, resolution, model) + the user's avatars/products, then let the user
choose. Only apply defaults if the user explicitly says "you choose" / "use
defaults". \`seedance_generate\` also asks the user to confirm the final
settings before spending credits (where the client supports it).

\`\`\`
plan_video_ad() → full option catalog (templates + params + avatars + products)
list_video_ad_templates() → just the module catalog with descriptions
seedance_generate({ prompt, module, image_url, ... }) → { task_id, share_url }
get_seedance_task(task_id) → status + result + share URL
\`\`\`

## Product Library (\`product_*\`)

Manage the reusable product objects that feed Marketing Studio ads. Uploading,
URL parsing, and object creation are separate steps so you can review a draft
before persisting it.

\`\`\`
product_upload_images({ file_paths }) → durable image URLs (order preserved)
product_parse_url({ product_url }) → product draft (read-only; not persisted)
product_create({ name, image_urls, metadata, ... }) → product object
product_update({ product_id, ... }) → updated product object
product_delete({ product_id }) → { deleted }
\`\`\`

## Avatar Library (\`avatar_*\`)

Browse, select, and create the avatars used as presenter references. A selected
or uploaded avatar returns \`reference: { id, url }\` that you pass straight into
\`seedance_generate.image_url\`.

\`\`\`
avatar_search({ query?, source?, ... }) → selectable avatars (read-only)
avatar_select({ avatar_id }) → { reference: { id, url } }
avatar_upload({ file_path, name?, ... }) → { reference: { id, url } }
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
| \`plan_video_ad\` | Marketing Studio | Full option catalog to present before generating |
| \`list_video_ad_templates\` | Marketing Studio | Discover the module template catalog |
| \`seedance_generate\` | Marketing Studio | Submit a template Video Ad render (confirms first) |
| \`get_seedance_task\` | Marketing Studio | Poll a Video Ad task |
| \`get_seedance_share_link\` | Marketing Studio | Public read-only share URL for a task |
| \`list_seedance_history\` | Marketing Studio | Browse Video Ad render history |
| \`product_upload_images\` | Product Library | Upload local product images → durable URLs |
| \`product_parse_url\` | Product Library | Parse a product page into a draft (read-only) |
| \`product_create\` | Product Library | Create a product-library object |
| \`product_update\` | Product Library | Update a product-library object |
| \`product_delete\` | Product Library | Delete a product-library object |
| \`avatar_search\` | Avatar Library | Search/browse selectable avatars (read-only) |
| \`avatar_select\` | Avatar Library | Get a generation-ready avatar reference |
| \`avatar_upload\` | Avatar Library | Upload + create a user avatar |

## Prompts

- \`video_ads_workflow\` — template-driven one-shot Video Ads (Marketing Studio).
`;

const VIDEO_ADS_WORKFLOW_PROMPT = `# Video Ads / Marketing Studio (template path)

Template-driven video ad generation through \`seedance_generate\`. If the user
wants a non-template direct render, use \`video_list_models\` /
\`video_generate\` (or \`image_*\`) instead.

## Core rule: options first, user chooses

The user picks the ad type and settings — you don't. **Do not auto-select a
template, aspect ratio, duration, resolution, model, or avatar**, and do not
announce a "default plan" and proceed. The only exception is when the user
explicitly says "you choose" / "just use defaults" / "surprise me".

## Procedure

1. **Present the options.** Call \`plan_video_ad\`. It returns every template,
   every parameter (aspect ratio, duration, resolution, model tier) with its
   default, and the user's own avatars and products. Show these to the user in
   a compact form and ask what they want — at minimum the **template**, and the
   key parameters if they care. Point out that spoken language is auto-detected
   from the prompt (they can name a language to override).

2. **Let the user pick a presenter + product.** Offer the avatars and products
   from \`plan_video_ad\`. To browse more, call \`avatar_search\`; to add one,
   \`avatar_upload\`. For products, \`product_parse_url\` / \`product_create\`.
   Pass the chosen references via \`image_url\` — either plain URL strings
   (\`["https://…"]\`) or material-library refs (\`[{ url, id }]\`; keep the
   \`id\` so the backend resolves the original asset).

3. **Submit for confirmation.** Once the user has chosen, call
   \`seedance_generate\` with their selections (\`prompt\`, \`module\`,
   \`ratio\`, \`duration\`, \`resolution\`, \`model\`, \`image_url\`, …). The
   tool then asks the user to confirm/edit the final settings before spending
   credits; if they dismiss it, nothing is generated — ask what to change and
   retry. You get back a \`task_id\` and share URL.

4. **Poll.** Call \`get_seedance_task(task_id)\` until \`status\` is
   \`succeeded\` or \`failed\`. Generation typically takes 1–3 minutes — tell
   the user it's running. Surface the \`result\` JSON and share URL when done.

5. **Share / history.** \`get_seedance_share_link(task_id)\` for a read-only
   link; \`list_seedance_history\` for "what have I rendered?".

## Boundaries

- Don't invent template values. The \`module\` enum is closed; take it from
  \`plan_video_ad\` / \`list_video_ad_templates\`.
- Don't pre-fill parameters the user hasn't chosen — leave them out and let the
  confirmation step / user choice fill them, unless the user opted into defaults.
- Don't strip the \`id\` off material-library refs.`;
