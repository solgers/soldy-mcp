---
name: soldy-mcp-setup
description: "Install and configure the Soldy AI MCP server (@soldy_ai/mcp) for any AI agent client. Use when the user wants to install Soldy MCP, connect Soldy to Claude Desktop / Cursor / Claude Code / Codex / Gemini CLI, set up video/image generation via MCP, or encounters Soldy login / SOLDY_API_KEY errors. Also triggers on: 'install soldy', 'add soldy mcp', 'configure soldy', 'soldy api key', 'npx @soldy_ai/mcp'."
---

# Soldy MCP Setup

Install and configure the `@soldy_ai/mcp` server so your AI agent can generate videos and images directly (Quick Create) and render template-driven Video Ads (Marketing Studio) through Soldy AI.

## Step 1: Check If Already Installed

Before installing, check whether the Soldy MCP server is already configured in your current environment. Look for a `soldy` entry in your MCP server configuration — for example, `claude mcp list` in Claude Code, or the `mcpServers` section in your client's config file.

If already installed, skip to **Step 3: Verify Connection**.

## Step 2: Install by Client

No API key is needed: the first time the server is used it opens your browser to log in to Soldy, mints an API key automatically, and caches it at `~/.soldy/credentials.json` for future sessions.

### Claude Code

```bash
claude mcp add soldy -- npx -y @soldy_ai/mcp
```

### Claude Desktop

Add to your config file (see paths above):

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

Restart Claude Desktop after saving.

### Cursor

Add to `~/.cursor/mcp.json`:

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

### Codex

```bash
codex mcp add soldy -- npx -y @soldy_ai/mcp
```

### Gemini CLI

Add to `~/.gemini/settings.json`:

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

### Headless / CI (no browser)

On machines where a browser login is impossible, set an explicit API key instead — it always takes precedence over the browser flow:

1. Go to [soldy.ai/app/settings](https://soldy.ai/app/settings), sign in, and create an API key.
2. Add `"env": { "SOLDY_API_KEY": "<your-api-key>" }` to the `soldy` server entry (or `env = { SOLDY_API_KEY = "<your-api-key>" }` in Codex's `~/.codex/config.toml`).

## Step 3: Verify Connection

After installation, call `list_video_ad_templates` (a cheap, read-only, no-argument tool) or `video_list_models`. The first call triggers the browser login if you have never logged in on this machine — complete it, then retry the tool. If it returns without error, the connection is working.

If you see errors:
- Browser login timed out / no browser opened — open the login URL printed on the server's stderr manually, or set `SOLDY_API_KEY` (see Headless above)
- `Invalid API key` / HTTP 401 — the cached key was revoked; restart the MCP client to log in again, or delete `~/.soldy/credentials.json`
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
