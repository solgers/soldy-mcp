# @soldy_ai/mcp

A Model Context Protocol (MCP) server for [Soldy AI](https://soldy.ai) — generate video ads and images directly from any MCP client.

## Installation

### Cursor / Claude Code (Recommended — via Skills)

The fastest way to set up the Soldy MCP in Cursor or Claude Code is to let the agent install it for you:

```
npx skills add https://github.com/solgers/soldy-mcp
```

This installs the Soldy skill which auto-configures the MCP server and provides contextual guidance to the agent.

### Claude Desktop / Cursor (Manual)

Add to your MCP configuration (`claude_desktop_config.json` or `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "soldy": {
      "command": "npx",
      "args": ["-y", "@soldy_ai/mcp"]
    }
  }
}
```

### Claude Code

```bash
claude mcp add soldy -- npx -y @soldy_ai/mcp
```

## Authentication

No configuration needed: on first use the server opens your browser to log in
to Soldy. Once you're signed in, an API key is created automatically and cached
at `~/.soldy/credentials.json` — later sessions reuse it without opening the
browser again.

To skip the browser flow (CI, headless machines), set the `SOLDY_API_KEY`
environment variable instead; it always takes precedence. Get an API key at
[app.soldy.ai/app/settings](https://app.soldy.ai/app/settings).

## What You Can Do

Two one-shot generation paths — no projects, no conversational agent.

**Quick Create** (provider-agnostic direct render)

- Generate video tasks with Seedance 2.0 / Seedance 2.0 Fast / Seedance 2.0 Mini / Kling 2.6 / MiniMax H3
- Generate image tasks with GPT Image 2 / Nano Banana Pro / Nano Banana 2 (Gemini)
- Submit prompts + reference media, then poll, list, retry, or delete tasks

**Marketing Studio** (template-driven Video Ads)

- Browse the live published template catalog — 21 formats across UGC (UGC Try
  On, Unboxing ASMR, Direct to Camera, Routine Insert, Try It On Face, Sneakers
  Try-On, Testimonial, This Saved Me, Before & After, Show How It Works, Giant
  Figure, …) and commercial (TV Spot, Hyper Motion, Wild Concept, Product In
  Use, Close-Up-Detail Proof, Show the Texture, Model Pro Try-On) — plus a
  `Direct` no-template fallback
- Render an ad from a single call, with the template's own duration limits
- Attach an optional opening hook from the Hooks Studio library
- Attach role-tagged product/avatar reference images across aspect ratios
  (9:16, 16:9, 1:1, …)
- Share generated Video Ads via public read-only links and browse render history

## License

Proprietary

### Recast Studio

Run `bun run build` in this directory. The package provides two independent
stdio entry points. Configure only the credentials for the entry point in use.

| Command                     | Connection                                                                                                 | Tools                                                                                                                                                 |
| --------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `soldy-recast-mcp`          | `SOLDY_API_URL` and a user-scoped `SOLDY_API_KEY`. Set `SOLDY_WEB_URL` to the web origin for result links. | List and read published templates, create a task using a workspace product or avatar, read status, cost and result links.                             |
| `soldy-recast-internal-mcp` | `SOLDY_ADMIN_API_URL` and a personal `SOLDY_API_KEY` (legacy admin session tokens are also supported).     | Sync and inspect feeds, submit share links, read candidates, list available workspaces, start an evaluation, read its report and retry a failed slot. |

For a local checkout, start `node dist/recast-product.js` or
`node dist/recast-internal.js`. Set the product API origin to
`http://127.0.0.1:8080`, the admin origin to `http://127.0.0.1:8081`, and the
web origin to `http://localhost:3000`. Reuse the same request key when retrying
the same submission. A new generation incurs the normal workspace charge.

Administrators can open **Recast → Connect MCP**, choose their billing organization and generate a personal connection configuration. Paste it into the MCP client. It installs the internal binary and supplies the admin API origin and `SOLDY_API_KEY`. Regenerating or revoking invalidates the previous key everywhere it was used. The environment gate controls internal tool access. A personal key must belong to an active Soldy user with a matching active admin account and current organization membership. Generation uses the selected organization's credits.

In **Agent Install**, choose Codex or Claude Code and run the displayed connector command in a terminal. The npm package includes the Recast Admin workflow skill. The connector registers the server and installs the bundled skill in the chosen client's skills directory. Reopen the client to load both. **Manual Config** registers the MCP server only.

For a reviewed Higgsfield batch, supply the target workspace, total credit ceiling and a stable request UUID when starting the scan. The backend starts an evaluation (optional `evaluation.task_count`, 1–5, default 1) for candidates approved during that run, including while the client is closed. Use the run ID to resume, check imports and read evaluation reports. Publishing requires an authorized publisher and an explicitly selected result. A scan without an evaluation budget remains scan-only. For manual evaluations, pass the same optional `task_count` to `quote_evaluation` and `start_evaluation`. In a Feishu bot mention, add a space followed by `task_count=2` after the video link to request two tests per link.

To make one edited variant, call `get_report` for the finished batch. Pass its
candidate ID and the selected successful task ID to `get_evaluation_edit_draft`.
The draft includes the original recipe, the image limit and the credit estimate
for one video. Browse approved replacements with `list_test_asset_categories`
and `list_test_assets`.

Call `start_edited_evaluation` with the complete ordered image list. For example,
`[{ "original_index": 1 }, { "catalog_id": 42, "replaces_original_index": 0 }]`
keeps the second original image first and replaces the first original image
with asset 42. Original indexes are zero-based. Omit `prompt` to update existing
numbered references from the new order. Supply an adjusted prompt if you remove
a referenced image or want to mention a newly added image. Use an approved
`max_credits` and a stable UUID v4. The tool returns a new evaluation ID to follow
with `get_report`. Both finished videos remain available under the candidate.
