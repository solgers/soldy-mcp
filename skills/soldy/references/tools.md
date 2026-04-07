# Soldy MCP — Tool Reference

Complete parameter reference for all 17 MCP tools exposed by `@soldy_ai/mcp`.

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

Returns: `task_id` for async tracking. Takes 30-60 seconds.

After calling, use `watch_brand_task(task_id)` to subscribe for completion (preferred), or poll `get_brand_task_result(task_id)`.

### get_brand_task_result

Check brand extraction progress. Prefer `watch_brand_task` for real-time updates.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `task_id` | string | yes | Task ID from `extract_brand` |

Returns: `status` (`running` with progress %, `finished` with `brand_id`, `failed` with reason)

---

## Project Tools

### create_project

Create a conversation project. After creation, use `send_message` to start generating.

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

Get project status and latest run activity. Prefer `watch_project` for long-running jobs.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `project_id` | string | yes | Project ID |

**Status meanings:**

| Status | Meaning | Action |
|--------|---------|--------|
| `ready` | Waiting for input | Call `send_message` |
| `running` | Agent processing | Wait (can take minutes for full pipeline) |
| `completed` | Generation finished | Call `get_project_materials` |
| `pause` | Credits or approval needed | Call `continue_project` |
| `error` | Generation failed | Retry with `send_message` |

---

## Message & Control Tools

### send_message

Send a generation request to the project agent. This triggers the full production pipeline.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `project_id` | string | yes | Project ID |
| `content` | string | yes | Prompt describing what to generate or modify |
| `ratio` | enum | **yes** | `9:16`, `16:9`, `1:1`, `4:3`, `3:4`, `3:2`, `2:3`, `21:9` |
| `material_urls` | string[] | no | Image/video/audio URLs or local file paths |
| `brand_id` | string | no | Brand ID for brand-aware generation |
| `input_mode` | enum | no | `agent` (default, full pipeline) or `seedance` (direct Seedance 2.0 video) |
| `seedance_reference_url` | string | no | Reference image for Seedance 2.0. **Required** when `input_mode='seedance'`. Local paths auto-upload. |

- `ratio` is **required** (not optional like in `create_project`)
- Local file paths in `material_urls` are auto-uploaded
- HTTP/GCS URLs pass through directly
- After sending, use `watch_project(project_id)` for real-time updates

**Seedance 2.0 mode (`input_mode='seedance'`)**

Bypasses the full creative-direction pipeline and drives Seedance 2.0 directly from a single reference image. Faster and lower-level — use when the user already has a strong reference and just wants a video from it.

- `seedance_reference_url` is required (one image URL or local file path).
- `content` can be empty — the agent builds the prompt from the reference. Pass `content` to steer motion, camera, or style.
- Still returns via the normal watch/materials flow.

```
send_message({
  project_id,
  content: "slow push-in, soft backlight, 5s",
  ratio: "9:16",
  input_mode: "seedance",
  seedance_reference_url: "./hero.jpg",
})
```

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

Stop generation completely. Restart later with `send_message`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `project_id` | string | yes | Project ID |

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

## Subscription Tools

### watch_project

Subscribe to real-time project updates. **Use instead of polling `get_project_status`.**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `project_id` | string | yes | Project ID to watch |

Receives notifications for:
- `soldy://project/{id}/status` — status changes
- `soldy://project/{id}/messages` — new messages
- `soldy://project/{id}/materials` — new generated assets
- `soldy://project/{id}/runs/{run_id}/messages` — per-run messages
- `soldy://project/{id}/runs/{run_id}/materials` — per-run materials

### watch_brand_task

Subscribe to brand extraction task progress. **Use instead of polling `get_brand_task_result`.**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `task_id` | string | yes | Task ID from `extract_brand` |

Receives notifications for:
- `soldy://brand/task/{task_id}` — progress/status changes
- `soldy://brands` — brand list updated on completion
- `soldy://brand/{brand_id}` — new brand details on completion

Auto-stops when task finishes or fails.

---

## Utility Tools

### upload_material

Returns HTTP upload endpoint info. Usually not needed — `send_message` handles local file uploads automatically.

No parameters.
