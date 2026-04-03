# @soldy_ai/mcp

A Model Context Protocol (MCP) server for [Soldy AI](https://soldy.ai) — generate video ads, extract brand identities, and manage creative projects from any MCP client.

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

- Create and manage video ad projects across aspect ratios (9:16, 16:9, 1:1, etc.)
- Extract brand identity from a product URL or website
- Send generation requests with text prompts and reference media (local files or URLs)
- Monitor generation progress, pause/resume, and retrieve final assets

## License

Proprietary
