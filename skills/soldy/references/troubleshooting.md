# Soldy MCP — Troubleshooting

## Installation Errors

| Error | Cause | Fix |
|-------|-------|-----|
| Browser login didn't open / timed out | Headless machine or blocked opener | Open the login URL printed on the server's stderr manually, or set `SOLDY_API_KEY` in the config env block. See `soldy-mcp-setup` skill. |
| `npx: command not found` | Node.js not installed | Install Node.js v18+ (includes npx) |
| MCP server not in tool list | Client not restarted after config | Restart the AI client; verify JSON syntax in config file |
| `EACCES` permission error | npm global install permissions | Run `npm config set prefix ~/.npm-global` and add to PATH |

## Authentication Errors

| Error | Cause | Fix |
|-------|-------|-----|
| HTTP 401 / `INVALID_API_KEY` | Cached or configured key revoked/wrong | Restart the MCP client to re-login via browser (cached keys are dropped automatically), or regenerate at [soldy.ai/app/settings](https://soldy.ai/app/settings) |
| HTTP 403 | Key lacks workspace permissions | Check workspace access in Soldy dashboard |
| `API_KEY_REQUIRED` | Key not passed to server | Complete the browser login, or verify `SOLDY_API_KEY` in config env block |
| `TOKEN_REQUIRED` | Auth token missing | Re-check API key configuration |

## Runtime Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `INSUFFICIENT_CREDITS` | Account out of credits | Top up at [soldy.ai/subscribe](https://soldy.ai/subscribe), then resubmit |
| `WORKSPACE_NOT_FOUND` | No workspace in org | Log in to [soldy.ai](https://soldy.ai) and create a workspace |
| `RATE_LIMIT_EXCEEDED` | Too many API requests | Wait and retry; reduce request frequency |
| Invalid `model` / `mode` | Value not in the registry | Call `video_list_models` / `image_list_models` and pass a listed value |
| Invalid `module` | Template value not recognized | Call `plan_video_ad` / `list_video_ad_templates`; the `module` enum is closed |
| `MARKETING_TEMPLATE_NOT_FOUND` | `marketing_template_id` is unknown or unpublished | Re-run `plan_video_ad` and use a current id |
| `MARKETING_TEMPLATE_HOOK_NOT_ALLOWED` | Hook not permitted for this template, or `module` doesn't match the template row | Check the template's `hook_policy`; drop `hook_id` or pick an allowlisted one, and pass the template's own `module` |
| `MARKETING_TEMPLATE_HOOK_DURATION_INVALID` | `duration` outside the template's window, or `-1` with a `marketing_template_id` | Use `duration_range` (or `duration_range_with_hook`) from `plan_video_ad`; never send `-1` with a template |
| `HOOK_MODULE_NOT_SUPPORTED` | `hook_id` on a module that can't take one | Drop `hook_id`, or pick a `hook_capable` template |

## Task Status Issues

| Status | Meaning | Resolution |
|--------|---------|------------|
| `pending` / `running` | Task queued or generating | Wait — video ~1–3 min, image ~1–4 min. Poll `video_get_task` / `image_get_task` / `get_seedance_task`. |
| `failed` | Generation failed | Read the error / failure reason in the task result. Retry a terminal Quick Create task with `video_retry_task` / `image_retry_task`, or resubmit with refined inputs. |
| Retry/delete rejected | Task is still running | Only terminal tasks can be retried or deleted. Wait for the task to finish first. |

## Connection Issues

| Problem | Fix |
|---------|-----|
| Tools not appearing in the session | Restart the AI client after config changes; confirm the `soldy` server is registered (e.g. `claude mcp list`). |
| Read-only check fails | Call `list_video_ad_templates` or `video_list_models` — a no-argument, read-only call. If it errors, re-check the API key and network/API URL. |

## File & Material Issues

| Problem | Fix |
|---------|-----|
| Local file not uploading | Verify the file path exists and is readable; use an absolute path if a relative one fails |
| URL material not recognized | Ensure the URL is publicly accessible; GCS URLs need the `gs://` prefix |
| Large file timeout | Split into smaller files or host externally and pass an HTTP URL |
| Material-library reference not resolving | Pass the `{ url, id }` object through unchanged in `seedance_generate` — don't strip the `id` |
| Generated materials not appearing | Generation may still be running — poll the task's status first |

## Common Mistakes

| Mistake | Correct Approach |
|---------|-----------------|
| Guessing `model` / `mode` values | Call `video_list_models` / `image_list_models` and pass a registry value |
| Guessing a template `module` | Call `plan_video_ad` / `list_video_ad_templates`; the enum is closed |
| Sending `duration: -1` with a template | Templates reject auto duration — pick a value inside `duration_range` |
| Dropping the `type` role off `image_url` refs | Tag `"avatar"` / `"product"` so the template places each reference correctly |
| Routing a format-named ad through Quick Create | "Make me a UGC ad" is Marketing Studio — use `seedance_generate` with the `module` |
| Routing a raw render through Marketing Studio | "Render this with Kling" is Quick Create — use `video_generate` |
| Expecting instant results | Generation takes minutes — submit, tell the user it's running, then poll |
| Polling in a tight loop | Submit, inform the user, then check back |

## Agent-Specific Issues

### Codex

| Problem | Fix |
|---------|-----|
| Login fails in sandboxed session | Codex sandboxes may block the browser opener or the localhost callback. Open the login URL from stderr manually, or fall back to `env = { SOLDY_API_KEY = "<key>" }` in `~/.codex/config.toml`. |

### Gemini CLI

| Problem | Fix |
|---------|-----|
| Config not recognized | Verify `~/.gemini/settings.json` uses the exact `mcpServers` key (not `mcp_servers` or `servers`). |
| JSON parse error in config | Ensure no trailing commas in `settings.json` — Gemini CLI uses strict JSON parsing. |
