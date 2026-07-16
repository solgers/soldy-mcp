---
name: soldy-mcp-setup
description: "Install and configure the Soldy AI MCP server (@soldy_ai/mcp) for any AI agent client. Use when the user wants to install Soldy MCP, connect Soldy to Claude Desktop / Cursor / Claude Code / Codex / Gemini CLI, set up video/image generation via MCP, or encounters SOLDY_API_KEY errors. Also triggers on: 'install soldy', 'add soldy mcp', 'configure soldy', 'soldy api key', 'npx @soldy_ai/mcp'."
---

# Soldy MCP Setup

Install and configure the `@soldy_ai/mcp` server so your AI agent can generate videos and images directly (Quick Create) and render template-driven Video Ads (Marketing Studio) through Soldy AI.

## Step 1: Check If Already Installed

Before installing, check whether the Soldy MCP server is already configured in your current environment. Look for a `soldy` entry in your MCP server configuration — for example, `claude mcp list` in Claude Code, or the `mcpServers` section in your client's config file.

If already installed, skip to **Step 4: Verify Connection**.

## Step 2: Get API Key

1. Go to [soldy.ai/app/settings](https://soldy.ai/app/settings)
2. Sign in or create an account
3. Copy your API key from the settings page

## Step 3: Install by Client

### Claude Code

```bash
claude mcp add soldy -e SOLDY_API_KEY=<your-api-key> -- npx -y @soldy_ai/mcp
```

### Claude Desktop

Add to your config file (see paths above):

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

Restart Claude Desktop after saving.

### Cursor

Add to `~/.cursor/mcp.json`:

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

### Codex

```bash
codex mcp add soldy -- npx -y @soldy_ai/mcp
```

Then add the API key to `~/.codex/config.toml`:

```toml
[mcp_servers.soldy]
env = { SOLDY_API_KEY = "<your-api-key>" }
```

### Gemini CLI

Add to `~/.gemini/settings.json`:

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

## Step 4: Verify Connection

After installation, call `list_video_ad_templates` (a cheap, read-only, no-argument tool) or `video_list_models`. If either returns without error, the connection is working.

If you see errors:
- `SOLDY_API_KEY is not set` — the env var was not passed correctly; re-check the config
- `Invalid API key` / HTTP 401 — regenerate the key at [soldy.ai/app/settings](https://soldy.ai/app/settings)
- `npx: command not found` — install Node.js v18+ (includes npx)
- MCP server not appearing — restart the AI client after config changes

## Next Steps

Once the MCP server is installed and verified, the **soldy** skill provides complete guidance on:
- Quick Create — one-shot provider-agnostic video/image renders (Seedance, Kling, GPT Image 2, Gemini)
- Marketing Studio — template-driven Video Ads (UGC, Unboxing, Tutorial, Product Review, TV Spot, and more)
- Prompt engineering and reference handling for each path
- Polling, retrying, and sharing generated results

Install it with:

```bash
npx skills add solgers/soldy-mcp@soldy
```
