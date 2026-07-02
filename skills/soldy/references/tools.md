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
| `timeout_seconds` | number | no | Max wait time (default 300 seconds / 5 minutes) |

**Returns:** `{ status, messages, materials, cursor, elapsed_seconds, ... }`

- `status`: `completed`, `paused`, `error`, or `timeout`
- `messages`: array of agent messages with content, tool calls, materials
- `materials`: all generated assets (videos, images, audio)
- `cursor`: for subsequent `get_updates` calls (useful on timeout)
- `pause_reason`: why the agent paused (if status is `paused`)
- `error_message`: what went wrong (if status is `error`)

### send_message

Fire-and-forget alternative to `chat`. Sends a message and returns immediately without waiting for the response. **For most use cases, prefer `chat` instead.**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `project_id` | string | yes | Project ID |
| `content` | string | yes | Prompt describing what to generate or modify |
| `ratio` | enum | **yes** | `9:16`, `16:9`, `1:1`, `4:3`, `3:4`, `3:2`, `2:3`, `21:9` |
| `material_urls` | string[] | no | Image/video/audio URLs or local file paths |
| `brand_id` | string | no | Brand ID for brand-aware generation |

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

---

## Project — extended endpoints

### copy_project

Copy a project plus its messages and brand/product assignments. Returns the new project. **Debug-gated server-side** — only works for accounts with the `enable_debug` Statsig gate.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `project_id` | string | yes | Source project ID |

### generate_project_name

Use the agent to suggest a fresh name for a project (typically derived from the first user message).

| Parameter | Type | Required | Description |
|---|---|---|---|
| `project_id` | string | yes | Project ID |

### add_showcase / remove_showcase / list_showcase

Manage the org's showcase gallery. `add` and `remove` are debug-gated.

| Tool | Args |
|---|---|
| `add_showcase` | `project_id` |
| `remove_showcase` | `project_id` |
| `list_showcase` | `page?`, `page_size?` |

### video_list_models

List the unified Quick Generation video model registry. Call before `video_generate` when you need valid model ids, modes, parameters, or asset slots. The registry is API-owned and includes Seedance 2.0, Seedance 2.0 Fast, and Kling 2.6 when enabled for the API key.

No parameters.

### video_generate

Submit a provider-agnostic video generation task through `/public/project/video/generate`. Use this for direct renders that do not need the conversational agent.

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `model` | string | yes | Registry id from `video_list_models`, e.g. `seedance-2.0`, `seedance-2.0-fast`, `kling-2.6` |
| `mode` | string | yes | Registry mode, e.g. `text_to_video`, `references`, `keyframes`, `image_to_video` |
| `project_id` | string | no | Existing `vproj_*`; omit to create a new gallery unit |
| `prompt` | string | no | Can also be provided inside `parameters.prompt` |
| `duration` / `ratio` / `resolution` / `generate_audio` / `negative_prompt` | mixed | no | Convenience top-level fields; override duplicates in `parameters` |
| `parameters` | object | no | Registry-specific scalar fields |
| `input_assets` | object | no | Registry-specific media slots such as `image_url`, `video_url`, `audio_url`, `first_image_url`, `last_image_url` |

Returns the new `vidtask_*`. Poll with `video_get_task`.

### video_get_task / video_list_tasks / video_retry_task / video_delete_task / video_get_lineage

Manage unified Quick Generation video tasks.

| Tool | Args | Notes |
|---|---|---|
| `video_get_task` | `task_id` | Poll one `vidtask_*`; may refresh provider status |
| `video_list_tasks` | `page?`, `page_size?`, `project_id?` | Lists latest execution per `vproj_*` gallery unit |
| `video_retry_task` | `task_id` | Retries terminal tasks only |
| `video_delete_task` | `task_id` | Soft-deletes terminal tasks only |
| `video_get_lineage` | `task_id` | Returns all retry attempts for a lineage |

### image_list_models

List the unified Quick Generation image model registry. Call before `image_generate` when you need valid model ids, modes, parameters, or asset slots. The registry is API-owned and includes GPT Image 2 and Gemini image models when enabled for the API key.

No parameters.

### image_generate

Submit a provider-agnostic image generation task through `/public/project/image/generate`. Use this for direct image generation/editing that does not need the conversational agent.

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `model` | string | yes | Registry id from `image_list_models`, e.g. `gpt-image-2`, `gemini-3-pro-image-preview` |
| `mode` | string | yes | Registry mode, e.g. `text_to_image`, `image_to_image` |
| `project_id` | string | no | Existing `improj_*`; omit to create a new gallery unit |
| `prompt` | string | no | Can also be provided inside `parameters.prompt` |
| `image_size` / `quality` / `ratio` / `output_format` / `num_images` | mixed | no | Convenience top-level fields; override duplicates in `parameters` |
| `parameters` | object | no | Registry-specific scalar fields |
| `input_assets` | object | no | Registry-specific media slots such as `image_urls` |

Returns the new `imgtask_*`. Poll with `image_get_task`.

### image_get_task / image_list_tasks / image_retry_task / image_delete_task / image_get_lineage

Manage unified Quick Generation image tasks.

| Tool | Args | Notes |
|---|---|---|
| `image_get_task` | `task_id` | Poll one `imgtask_*` |
| `image_list_tasks` | `page?`, `page_size?`, `project_id?` | Lists latest execution per `improj_*` gallery unit |
| `image_retry_task` | `task_id` | Retries terminal tasks only |
| `image_delete_task` | `task_id` | Soft-deletes terminal tasks only |
| `image_get_lineage` | `task_id` | Returns all retry attempts for a lineage |

### seedance_generate

Submit a legacy Marketing Studio / Video Ads Seedance task **directly** (bypasses the conversational agent). Returns a `task_id` and public read-only share link immediately; poll with `get_seedance_task`. Use this compatibility path when the user specifically wants a template `module` such as UGC, Tutorial, or Unboxing. For provider-agnostic Seedance/Kling video, prefer `video_generate`; for creative iteration, prefer `chat`.

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `prompt` | string | yes | |
| `image_url` / `video_url` / `audio_url` | string[] | no | Reference media URLs |
| `duration` | number | no | -1 = auto, otherwise 4–15 (default 10) |
| `ratio` | string | no | `16:9` `4:3` `1:1` `3:4` `9:16` `21:9` `adaptive` |
| `input_ratio` | string | no | Source media ratio hint |
| `model` | string | no | `doubao-seedance-2-0-260128` (default) or `…-fast-260128` |
| `resolution` | enum | no | `480p` `720p` `1080p` |
| `module` | string | no | `Direct` (default), `UGC`, `Tutorial`, `Unboxing`, `Hyper_Motion`, `Product_Review`, `TV_Spot`, `Wild_Card`, `UGC_Virtual_Try_On`, `Pro_Virtual_Try_On` |

### get_seedance_task

Poll a Seedance task by ID. Returns status, the public read-only Video Ads share link, and result JSON when available.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `task_id` | string | yes | From `seedance_generate` |

### get_seedance_share_link

Return the public read-only web share URL for a Video Ads / Marketing Studio task.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `task_id` | string | yes | Seedance task ID |

### list_seedance_history

Paginated list of Seedance tasks, optional status filter (`pending`, `running`, `succeeded`, `failed`). Rows include the same public share link as `get_seedance_share_link`.

---

## Brand — extended endpoints

### fetch_brand_social

Fetch recent social-media posts for a brand (Apify-backed). Returns immediately with a brand task; poll `get_brand_task_result` for the materialized posts.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `brand_id` | string | yes | |
| `accounts` | object[] | yes | One or more `{ platform, url, handle? }` |

`platform` is a social-network identifier (e.g. `"instagram"`, `"tiktok"`, `"x"`). Server-side gate: requires `brand_social_media_research_access` Statsig gate or a configured Apify API key.

---

## Standalone workflows (Recast / CineAd / ImageKit)

These are **alternatives to `chat`** for narrowly-scoped, single-output generation. They never enter the conversational agent — each is a deterministic pipeline. Each `_generate` tool is a one-shot wrapper that drives session→prompt→video (or analyze→generate) and polls until done.

For all three: source media must already be uploaded via `upload_material` (or any URL the backend can read).

### Recast

Re-style an existing source video (Style Transfer or Object Replacement).

| Tool | Purpose |
|---|---|
| `recast_generate` | One-shot. Inputs: `video_url`/`video_name`/`video_size`/`video_mime`/`video_duration`/`video_thumbnail_url`, `recast_dimension` (`Style Transfer` \| `Object Replacement`), `recast_description`, `product_url?`. Blocks up to `timeout_seconds` (default 600). |
| `recast_get_video_status` | Poll a single video by `video_id`. |
| `recast_list_history` | Paginated history. |
| `recast_get_history_detail` | Full input + result for one session. |

### CineAd

Match a product image to a famous movie scene and render an ad with a structured Hook/Body/CTA script.

| Tool | Purpose |
|---|---|
| `cinead_generate` | One-shot. Inputs: `image_url`, `product_name`, `key_selling_point?`. Returns the matched scene + ad script + final video. |
| `cinead_get_video_status` | Poll a single video by `video_id`. |
| `cinead_list_history` | Paginated history. |
| `cinead_get_history_detail` | Full detail (matched scene, ad script, video). |

### ImageKit

Generate a marketing **image kit** (set of layouts) for a product. Synchronous — no polling.

| Tool | Purpose |
|---|---|
| `imagekit_generate` | One-shot. Inputs: `image_url`, `product_name`, `kit_type` (`shopify` \| `amazon` \| `meta`), `key_selling_point?`, `image_types?`. Returns the full set. |
| `imagekit_list_history` | Paginated history. |
| `imagekit_get_history_detail` | Full detail. |

---

## Standalone agent primitives (tool tasks)

Async one-off agent calls. Each one creates a `tool_task` row; with `wait=true` (default) the MCP polls until done. With `wait=false` you get back a `task_id` to poll yourself.

### generate_look_reference

Generate a cinematic look reference (clean scene image + annotated palette board).

| Parameter | Type | Required | Description |
|---|---|---|---|
| `scene_description` | string | yes | |
| `hex_palette` | object | yes | `{ primary, secondary, accent, shadow }` — each `#RRGGBB` |
| `lighting` / `atmosphere` / `textures` | string | no | Tonal hints |
| `ratio` | string | no | Default `"16:9"` |
| `include_product` | boolean | no | If true, supply `product_image_url` |
| `product_image_url` | string | no | |
| `wait` | boolean | no | Default `true` |
| `timeout_seconds` | number | no | Default 600 |

### generate_cast_design

Generate a character cast brief (archetype + visual prompts + per-member hero image). LLM infers methodology details from the description.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `description` | string | yes | |
| `context` | string | no | |
| `style_mode` | enum | no | `realistic` (default), `stylized`, `cartoon` |
| `reference_images` | string[] | no | |
| `ratio` | string | no | Default `9:16` |
| `wait` | boolean | no | Default `true` |
| `timeout_seconds` | number | no | Default 900 |

### get_tool_task

Poll one tool task by `task_id` (use after a `_generate` with `wait=false`).

### list_tool_tasks

List recent tool tasks for the workspace, newest first.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `tool_name` | string | no | Filter (e.g. `generate_look_reference`) |
| `limit` | number | no | Max rows |
