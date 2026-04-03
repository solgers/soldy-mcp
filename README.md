# @soldy/mcp

A Model Context Protocol (MCP) server for [Soldy AI](https://soldy.ai) — generate video ads, extract brand identities, and manage creative projects from any MCP client.

## Installation

### Claude Desktop / Cursor

Add to your MCP configuration (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "soldy": {
      "command": "npx",
      "args": ["-y", "@soldy/mcp"],
      "env": {
        "SOLDY_API_KEY": "<your-api-key>"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add soldy -e SOLDY_API_KEY=<your-api-key> -- npx -y @soldy/mcp
```

Get your API key at [app.soldy.ai/app/settings](https://app.soldy.ai/app/settings).

## What You Can Do

- Create and manage video ad projects across aspect ratios (9:16, 16:9, 1:1, etc.)
- Extract brand identity from a product URL or website
- Send generation requests with text prompts and reference media (local files or URLs)
- Monitor generation progress, pause/resume, and retrieve final assets

## License

Proprietary
