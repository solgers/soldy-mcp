# Soldy MCP — Troubleshooting

## Installation Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `SOLDY_API_KEY is not set` | Env var missing from MCP config | Add `SOLDY_API_KEY` to the `env` block in client config. See `soldy-mcp-setup` skill. |
| `npx: command not found` | Node.js not installed | Install Node.js v18+ (includes npx) |
| MCP server not in tool list | Client not restarted after config | Restart the AI client; verify JSON syntax in config file |
| `EACCES` permission error | npm global install permissions | Run `npm config set prefix ~/.npm-global` and add to PATH |

## Authentication Errors

| Error | Cause | Fix |
|-------|-------|-----|
| HTTP 401 / `INVALID_API_KEY` | API key expired or wrong | Regenerate at [soldy.ai/app/settings](https://soldy.ai/app/settings) |
| HTTP 403 | Key lacks workspace permissions | Check workspace access in Soldy dashboard |
| `API_KEY_REQUIRED` | Key not passed to server | Verify `SOLDY_API_KEY` in config env block |
| `TOKEN_REQUIRED` | Auth token missing | Re-check API key configuration |

## Runtime Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `INSUFFICIENT_CREDITS` | Account out of credits | Top up at [soldy.ai/subscribe](https://soldy.ai/subscribe), then `continue_project` |
| `PROJECT_NOT_FOUND` | Invalid project_id | Use `list_projects` to find valid IDs |
| `BRAND_NOT_FOUND` | Invalid brand_id | Use `list_brands` to find valid IDs |
| `BRAND_TASK_NOT_FOUND` | Invalid task_id | Use the task_id returned by `extract_brand` |
| `WORKSPACE_NOT_FOUND` | No workspace in org | Log in to [soldy.ai](https://soldy.ai) and create a workspace |
| `PROJECT_LIMIT_EXCEEDED` | Too many active projects | Archive or delete old projects |
| `RATE_LIMIT_EXCEEDED` | Too many API requests | Wait and retry; reduce request frequency |

## Project Status Issues

| Status | Meaning | Resolution |
|--------|---------|------------|
| `pause` | Agent paused — credits or approval needed | Top up credits, then `continue_project(project_id)` |
| `error` | Generation failed | Check error in `chat` response or `get_project_status`; retry with new `chat` call |
| Stuck on `running` | Long generation or connectivity issue | Complex videos take several minutes (full pipeline). Use `get_updates` or `get_project_status` to check. |

## Connection Issues

| Problem | Fix |
|---------|-----|
| `chat` times out before completion | Increase `timeout_seconds` (default 300). Or use `send_message` + `get_updates` for async flow. |
| WebSocket connection failed | MCP server auto-reconnects. If persistent, check network and API URL. |
| `get_updates` returns no events | Events buffer within the MCP session. If MCP server restarted, use `get_project_status` + `list_messages` instead. |

## File & Material Issues

| Problem | Fix |
|---------|-----|
| Local file not uploading | Verify file path exists and is readable; use absolute path if relative fails |
| URL material not recognized | Ensure URL is publicly accessible; GCS URLs need `gs://` prefix |
| Large file timeout | Split into smaller files or host externally and pass HTTP URL |
| Generated materials not appearing | Generation may still be running — check `chat` response status or `get_project_status` first |

## Common Mistakes

| Mistake | Correct Approach |
|---------|-----------------|
| Not passing `ratio` to `chat` | `ratio` is required — choose based on target platform |
| Putting product URL in text only | Use `extract_brand(url)` explicitly to extract brand identity |
| Using `send_message` when `chat` works | Prefer `chat` — it sends and waits in one call |
| Not passing `brand_id` | Always include `brand_id` in `chat` when a brand exists |
| Expecting instant results | Full production pipeline takes minutes — creative direction, storyboard, video generation, music |
| Creating new project to iterate | Send another `chat` call to the same project instead |

## Agent-Specific Issues

### Cursor

| Problem | Fix |
|---------|-----|
| `chat` seems stuck | Cursor may have shorter tool timeout. Use `send_message` + `get_updates` as alternative. |
| Config not loading | Verify `~/.cursor/mcp.json` has valid JSON syntax. Restart Cursor after changes. |

### Codex

| Problem | Fix |
|---------|-----|
| `SOLDY_API_KEY is not set` | Codex requires the env var exported in the shell session before running. Use `export SOLDY_API_KEY=<key>` before starting the MCP server. |

### Gemini CLI

| Problem | Fix |
|---------|-----|
| Config not recognized | Verify `~/.gemini/settings.json` uses the exact `mcpServers` key (not `mcp_servers` or `servers`). |
| JSON parse error in config | Ensure no trailing commas in `settings.json` — Gemini CLI uses strict JSON parsing. |
