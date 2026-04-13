# Soldy MCP — Tool Reference

Complete parameter reference for all MCP tools exposed by `@soldy_ai/mcp`.

---

## Brand Tools

### create_brand

Create a brand manually. Use before `create_project` if user has brand identity to associate.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | yes | Brand name |
| `description` | string | no | Brand description |
| `stage` | string | no | Brand stage |

Returns: brand ID, name, web link (`https://soldy.ai/app/brands/{id}`)

### list_brands

List all brands in the workspace. Check here first if user mentions a brand or company.

No parameters. Returns table of brands with name, ID, stage. Cached for 5 seconds.

### extract_brand

Extract brand identity from a product URL or website. **Call this BEFORE `create_project`** when user provides a product page URL — it gives the agent brand context (colors, tone, positioning).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `content` | string | yes | Product page URL, brand website URL, or text describing the brand |
| `brand_id` | string | no | Existing brand ID to update with extracted data |
| `wait` | boolean | no | Wait for extraction to complete (default `true`). Set `false` for fire-and-forget. |

With `wait=true` (default): blocks until extraction completes (usually 30-60s) and returns the `brand_id` directly.

With `wait=false`: returns a `task_id` immediately — use `get_brand_task_result` to poll status.

### get_brand_task_result

Check brand extraction progress. Use when `extract_brand` was called with `wait=false`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `task_id` | string | yes | Task ID from `extract_brand` |

Returns: `status` (`running` with progress %, `finished` with `brand_id`, `failed` with reason)

---

## Project Tools

### create_project

Create a conversation project. After creation, use `chat` to start generating.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | yes | Project name |
| `brand_id` | string | no | Brand ID to associate |
| `ratio` | enum | no | Default video ratio. Can be overridden per message. |
| `description` | string | no | Project description |

Ratio options: `9:16`, `16:9`, `1:1`, `4:3`, `3:4`, `3:2`, `2:3`, `21:9`

Returns: project ID, status, web link (`https://soldy.ai/app/chat/{id}`)

### get_project

Get project details including name, status, ratio, brand, timestamps.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `project_id` | string | yes | Project ID |

### list_projects

List all projects with status.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `page` | number | no | Page number |
| `page_size` | number | no | Items per page |

Cached for 5 seconds.

### get_project_status

Quick status check. For blocking workflow, prefer `chat` which waits for completion automatically. For async follow-up, use `get_updates`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `project_id` | string | yes | Project ID |

**Status meanings:**

| Status | Meaning | Action |
|--------|---------|--------|
| `ready` | Waiting for input | Call `chat` or `send_message` |
| `running` | Agent processing | Wait (can take minutes for full pipeline) |
| `completed` | Generation finished | Call `get_project_materials` |
| `pause` | Credits or approval needed | Call `continue_project` |
| `error` | Generation failed | Retry with `chat` or `send_message` |

---

## Conversation Tools

### chat

**Primary tool.** Send a message to the project agent and wait for the complete response. Blocks until the agent run completes, pauses, errors, or times out.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `project_id` | string | yes | Project ID |
| `message` | string | yes | Prompt describing what to generate or modify |
| `ratio` | enum | **yes** | `9:16`, `16:9`, `1:1`, `4:3`, `3:4`, `3:2`, `2:3`, `21:9` |
| `material_urls` | string[] | no | Image/video/audio URLs or local file paths |
| `brand_id` | string | no | Brand ID for brand-aware generation |
| `input_mode` | enum | no | `agent` (default, full pipeline) or `seedance` (direct Seedance 2.0 video) |
| `seedance_reference_url` | string | no | Reference image for Seedance 2.0. **Required** when `input_mode='seedance'`. |
| `timeout_seconds` | number | no | Max wait time (default 300 seconds / 5 minutes) |

**Returns:** `{ status, messages, materials, cursor, elapsed_seconds, ... }`

- `status`: `completed`, `paused`, `error`, or `timeout`
- `messages`: array of agent messages with content, tool calls, materials
- `materials`: all generated assets (videos, images, audio)
- `cursor`: for subsequent `get_updates` calls (useful on timeout)
- `pause_reason`: why the agent paused (if status is `paused`)
- `error_message`: what went wrong (if status is `error`)

**Seedance 2.0 mode (`input_mode='seedance'`)**

Bypasses the full creative-direction pipeline and drives Seedance 2.0 directly from a single reference image. Faster and lower-level — use when the user already has a strong reference and just wants a video from it.

- `seedance_reference_url` is required (one image URL or local file path).
- `message` can be empty — the agent builds the prompt from the reference. Pass `message` to steer motion, camera, or style.

```
chat({
  project_id,
  message: "slow push-in, soft backlight, 5s",
  ratio: "9:16",
  input_mode: "seedance",
  seedance_reference_url: "./hero.jpg",
})
```

### send_message

Fire-and-forget alternative to `chat`. Sends a message and returns immediately without waiting for the response. **For most use cases, prefer `chat` instead.**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `project_id` | string | yes | Project ID |
| `content` | string | yes | Prompt describing what to generate or modify |
| `ratio` | enum | **yes** | `9:16`, `16:9`, `1:1`, `4:3`, `3:4`, `3:2`, `2:3`, `21:9` |
| `material_urls` | string[] | no | Image/video/audio URLs or local file paths |
| `brand_id` | string | no | Brand ID for brand-aware generation |
| `input_mode` | enum | no | `agent` (default) or `seedance` |
| `seedance_reference_url` | string | no | Reference image for Seedance 2.0. |

After sending, use `get_updates(project_id)` to check for results, or `get_project_status` for a quick status check.

### get_updates

Get new events for a project since a given cursor. Use after `chat` timeout or `send_message`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `project_id` | string | yes | Project ID |
| `cursor` | string | no | Cursor from a previous `chat` or `get_updates` call |
| `wait_seconds` | number | no | Long-poll: wait up to N seconds for new events (default 0 = immediate, max 60) |

Returns: events with text, tool calls, materials, and a new cursor for subsequent calls.

---

## Control Tools

### pause_project

Pause running generation without losing progress.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `project_id` | string | yes | Project ID |
| `run_id` | string | no | Specific run ID |

### continue_project

Resume a paused project. Use after `pause_project` or when agent paused for credits/approval.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `project_id` | string | yes | Project ID |
| `run_id` | string | no | Specific run ID |
| `should_remind` | boolean | no | Set false to skip future pause reminders |

### stop_project

Stop generation completely. Restart later with `chat` or `send_message`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `project_id` | string | yes | Project ID |

---

## History Tools

### list_messages

Get conversation history for a project.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `project_id` | string | yes | Project ID |
| `page` | number | no | Page number |
| `page_size` | number | no | Items per page |

Returns messages with: role, content, event type, materials, tool calls, timestamps.

### get_project_materials

Get all generated assets. Use after generation completes.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `project_id` | string | yes | Project ID |

Returns array of materials with: url, type (video/image/audio/document), thumbnail, display_title, asset_category.

---

## Utility Tools

### upload_material

Returns HTTP upload endpoint info. Usually not needed — `chat` and `send_message` handle local file uploads automatically.

No parameters.
