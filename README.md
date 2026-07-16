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
      "args": ["-y", "@soldy_ai/mcp"],
      "env": {
        "SOLDY_API_KEY": "<your-api-key>"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add soldy -e SOLDY_API_KEY=<your-api-key> -- npx -y @soldy_ai/mcp
```

Get your API key at [app.soldy.ai/app/settings](https://app.soldy.ai/app/settings).

## What You Can Do

Two one-shot generation paths — no projects, no conversational agent.

**Quick Create** (provider-agnostic direct render)

- Generate video tasks with Seedance 2.0 / Seedance 2.0 Fast / Kling 2.6
- Generate image tasks with GPT Image 2 / Gemini models
- Submit prompts + reference media, then poll, list, retry, or delete tasks

**Marketing Studio** (template-driven Video Ads)

- Render UGC, Unboxing, Tutorial, Product Review, TV Spot, Hyper Motion,
  Wild Card, and Virtual Try-On ads from a single call
- Attach product/avatar reference images across aspect ratios (9:16, 16:9, 1:1, …)
- Share generated Video Ads via public read-only links and browse render history

## License

Proprietary
