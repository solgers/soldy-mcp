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

| Command | Connection | Tools |
| --- | --- | --- |
| `soldy-recast-mcp` | `SOLDY_API_URL` and a user-scoped `SOLDY_API_KEY`. Set `SOLDY_WEB_URL` to the web origin for result links. | List and read published templates, create a task using a workspace product or avatar, read status, cost and result links. |
| `soldy-recast-internal-mcp` | `SOLDY_ADMIN_API_URL` and a personal `SOLDY_API_KEY` (legacy admin session tokens are also supported). | Sync and inspect feeds, submit share links, read candidates, list available workspaces, start a five-task evaluation, read its report and retry a failed slot. |

For a local checkout, start `node dist/recast-product.js` or
`node dist/recast-internal.js`. Set the product API origin to
`http://127.0.0.1:8080`, the admin origin to `http://127.0.0.1:8081`, and the
web origin to `http://localhost:3000`. Reuse the same request key when retrying
the same submission. A new generation incurs the normal workspace charge.

Administrators can open **Recast → Connect MCP**, choose their billing organization and generate a personal connection configuration. Paste it into the MCP client. It installs the internal binary and supplies the admin API origin and `SOLDY_API_KEY`. Regenerating or revoking invalidates the previous key everywhere it was used. The environment gate controls internal tool access. A personal key must belong to an active Soldy user with a matching active admin account and current organization membership. Generation uses the selected organization's credits.

In **Agent Install**, run this command in the project where you use your agent:

```sh
npx skills add https://github.com/solgers/soldy-mcp --skill soldy-recast-admin
```

Select the intended agent, then ask it to connect Recast admin MCP using the admin API origin displayed on the page. The setup skill guides registration and a read-only connection check. For manual setup, choose a client in **Manual Config**.
