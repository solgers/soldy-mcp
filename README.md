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
