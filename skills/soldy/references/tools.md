# Soldy MCP — Tool Reference

Complete parameter reference for every MCP tool exposed by `@soldy_ai/mcp`. There are two paths: **Quick Create** (`video_*` / `image_*`) and **Marketing Studio / Video Ads** (`seedance_*` / `list_video_ad_templates`).

---

## Quick Create — Video (`video_*`)

Provider-agnostic direct video generation through the API model registry (Seedance 2.0, Seedance 2.0 Fast, Kling 2.6, and MiniMax H3 when enabled for the API key).

### video_list_models

List the Quick Create video model registry. Call before `video_generate` when you need valid model ids, modes, parameters, or asset slots. The registry is API-owned.

No parameters. Returns a table of models with id, label, provider, modes, and key params.

### video_generate

Submit a direct video generation task through `/public/project/video/generate`.

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `model` | string | yes | Registry id from `video_list_models`, e.g. `seedance-2.0`, `seedance-2.0-fast`, `kling-2.6` |
| `mode` | string | yes | Registry mode, e.g. `text_to_video`, `references`, `keyframes`, `image_to_video` |
| `project_id` | string | no | Existing `vproj_*` gallery id; omit to create a new gallery unit |
| `prompt` | string | no | Generation prompt |
| `duration` | number | no | Convenience top-level field; overrides a duplicate in `parameters` |
| `ratio` | string | no | Convenience top-level field |
| `resolution` | string | no | Convenience top-level field |
| `generate_audio` | boolean | no | Convenience top-level field |
| `negative_prompt` | string | no | Convenience top-level field |
| `parameters` | object | no | Registry-specific scalar fields |
| `input_assets` | object | no | Registry-specific media slots such as `image_url`, `video_url`, `audio_url`, `first_image_url`, `last_image_url` |

Local file paths in `input_assets` are uploaded before submission. Returns the new `vidtask_*`; poll with `video_get_task`. Generation typically takes 1–3 minutes.

### video_get_task / video_list_tasks / video_retry_task / video_delete_task / video_get_lineage

Manage Quick Create video tasks.

| Tool | Args | Notes |
|---|---|---|
| `video_get_task` | `task_id` | Poll one `vidtask_*`; may refresh provider status |
| `video_list_tasks` | `page?`, `page_size?`, `project_id?` | Lists latest execution per `vproj_*` gallery unit |
| `video_retry_task` | `task_id` | Retries terminal tasks only; returns a new `vidtask_*` in the same lineage |
| `video_delete_task` | `task_id` | Soft-deletes terminal tasks only (running tasks are rejected) |
| `video_get_lineage` | `task_id` | Returns all retry attempts for a lineage |

---

## Quick Create — Image (`image_*`)

Provider-agnostic direct image generation through the API model registry (GPT Image 2 and Gemini image models when enabled for the API key).

### image_list_models

List the Quick Create image model registry. Call before `image_generate` when you need valid model ids, modes, parameters, or asset slots. The registry is API-owned.

No parameters. Returns a table of models with id, label, provider, modes, and key params.

### image_generate

Submit a direct image generation task through `/public/project/image/generate`.

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `model` | string | yes | Registry id from `image_list_models`, e.g. `gpt-image-2`, `gemini-3-pro-image` |
| `mode` | string | yes | Registry mode, e.g. `text_to_image`, `image_to_image` |
| `project_id` | string | no | Existing `improj_*` gallery id; omit to create a new gallery unit |
| `prompt` | string | no | Generation prompt |
| `image_size` | string | no | Convenience top-level field; overrides a duplicate in `parameters` |
| `quality` | string | no | Convenience top-level field |
| `ratio` | string | no | Convenience top-level field |
| `output_format` | string | no | Convenience top-level field |
| `num_images` | number | no | Convenience top-level field |
| `parameters` | object | no | Registry-specific scalar fields |
| `input_assets` | object | no | Registry-specific media slots such as `image_urls` |

Local file paths in `input_assets` are uploaded before submission. Returns the new `imgtask_*`; poll with `image_get_task`. Generation typically takes 1–4 minutes.

### image_get_task / image_list_tasks / image_retry_task / image_delete_task / image_get_lineage

Manage Quick Create image tasks.

| Tool | Args | Notes |
|---|---|---|
| `image_get_task` | `task_id` | Poll one `imgtask_*` |
| `image_list_tasks` | `page?`, `page_size?`, `project_id?` | Lists latest execution per `improj_*` gallery unit |
| `image_retry_task` | `task_id` | Retries terminal tasks only; returns a new `imgtask_*` in the same lineage |
| `image_delete_task` | `task_id` | Soft-deletes terminal tasks only (running tasks are rejected) |
| `image_get_lineage` | `task_id` | Returns all retry attempts for a lineage |

---

## Marketing Studio / Video Ads (`plan_video_ad`, `seedance_*`)

Template-driven, one-shot Video Ad generation via Seedance. Returns a `task_id` and a public read-only share link immediately. The template catalog is live and database-backed — read it, don't hard-code it.

### plan_video_ad

The full option catalog to present before generating. Read-only. **Call this first for any ad request.**

No parameters. Returns JSON with:

| Key | Contents |
|---|---|
| `templates.items` | Live published templates: `marketing_template_id`, `template_key`, `name`, `description`, `category` (`ugc` / `commercial`), `module`, `requires_avatar`, `hook_capable`, `hook_policy`, `duration_range`, `duration_range_with_hook`, `defaults`, `preview_url` |
| `modules` | Static module catalog (`value`, `name`, `description`, `category`, `requiresAvatar`, `hookCapable`) plus `legacy` aliases and the `direct` fallback |
| `parameters` | Every parameter with its default, options, and limits |
| `hooks` | Opening-hook library: `presets` and the user's own `user` hooks |
| `avatars` / `products` | The user's own libraries, ready to pass into `image_url` |

### list_video_ad_templates

List the Video Ad / Marketing Studio templates. Each module entry's `value` is what you pass as `module` to `seedance_generate`; each published row also carries the `marketing_template_id` to pass alongside it. Prefer `plan_video_ad` when starting an ad.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `published_only` | boolean | no | Default `false`. When `true`, return only the live published rows and omit the static module catalog. |

Module values — 21 templates: `UGC`, `UGC_Try_On`, `Unboxing_ASMR`, `This_Saved_Me`, `Product_First`, `Close_Up_Detail_Proof`, `Show_The_Texture`, `UGC_Showing_Product`, `Routine_Insert`, `Direct_To_Camera`, `Giant_Figure`, `Try_It_On_Face`, `Show_How_It_Works`, `Unboxing`, `Hyper_Motion`, `Before_After`, `Sneakers_Try_On`, `Model_Pro_Try_On`, `TV_Spot`, `Wild_Concept`, `Testimonial`. Legacy aliases: `Tutorial`, `Product_Review`, `Wild_Card`, `UGC_Virtual_Try_On`, `Pro_Virtual_Try_On`. Plus `Direct` (default fallback — runs from prompt + media with no template preset).

### list_video_ad_hooks

The opening-hook library (Hooks Studio). Pass a chosen entry's `hook_id` to `seedance_generate`. Hook prompt bodies stay server-side; you get `hook_id`, `name`, `description`, `category`, `source`.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `category` | string | no | Preset category filter: `recommended`, `high_interruption`, `trust_building`, `tutorial`, `ugc_natural` |
| `limit` | number | no | Max hooks per group. Default 24, capped at 100. |

### seedance_generate

Submit a Video Ad / Marketing Studio task. Pick a template, attach product/avatar references in `image_url`, and pass both its `module` and `marketing_template_id`.

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `prompt` | string | yes | Generation prompt |
| `image_url` | array | no | Reference image(s). Plain URL strings, or `{ url, id?, thumbnail_url?, type? }` objects where `id` references an item from the user's material library and `type` is the Marketing Studio role (`"product"`, `"avatar"`, `"image"`). Pass the `id` and the role through when you have them. |
| `video_url` | array | no | Reference video(s). Same shape as `image_url`. |
| `audio_url` | array | no | Reference audio track(s). Same shape as `image_url`. |
| `duration` | number | no | Seconds: 4–15, default 10. `-1` (auto) only when no `marketing_template_id` is set. A template narrows this — use its `duration_range` (or `duration_range_with_hook`). |
| `ratio` | enum | no | `16:9` `4:3` `1:1` `3:4` `9:16` `21:9` `adaptive`. Default `9:16`. |
| `input_ratio` | enum | no | Input reference aspect ratio. When set, the backend uses this in place of `ratio` downstream. Same allowed values as `ratio`. |
| `model` | enum | no | `doubao-seedance-2-0-260128` (Standard, default), `doubao-seedance-2-0-fast-260128` (Fast), `doubao-seedance-2-0-mini-260615` (Mini; 480p/720p only) |
| `resolution` | enum | no | `480p` `720p` `1080p` `4k` `1080P`. Default `720p`. `4k` / `1080P` are upscale tiers; `1080P` requires the Standard model. |
| `module` | enum | no | `Direct` (default; no template) or any of the 21 templates / 5 legacy aliases above |
| `marketing_template_id` | string | no | Published template row id (`mktpl_…`) from `plan_video_ad`. Pass it whenever the user picked a template — the backend checks it matches `module` and enforces the template's hook + duration policy. |
| `hook_id` | string | no | Opening-hook id (`hookt_…`) from `list_video_ad_hooks`. Hook-capable modules only; the template's `hook_policy` may restrict which hooks are allowed. |
| `hook_selection_source` | enum | no | Analytics-only: `marketing_studio` (default when a hook is set), `hooks_studio`, `landing`, `share` |
| `project_id` | string | no | Marketing project to group this render under. Omit to let the API create one. |
| `callback_url` | string | no | Optional HTTPS URL for Volcano Ark task callbacks (http allowed for localhost) |

Returns a `task_id`, `status`, and a public share URL. Poll with `get_seedance_task`. Generation typically takes 1–3 minutes.

### get_seedance_task

Poll a Seedance task by ID. Returns `status` (`pending` / `running` / `succeeded` / `failed`), the template and hook it used, the public read-only share URL, credits charged, any `failure_reason`, and the result JSON when done.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `task_id` | string | yes | From `seedance_generate` or `list_seedance_history` |

### get_seedance_share_link

Return the public read-only web share URL for a Video Ads / Marketing Studio task (`/app/share/marketing-studio/{task_id}`).

| Parameter | Type | Required | Description |
|---|---|---|---|
| `task_id` | string | yes | Seedance task ID |

### list_seedance_history

Paginated list of Seedance / Marketing Studio tasks. Rows include the same public share link as `get_seedance_share_link`.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `page` | number | no | Page number |
| `page_size` | number | no | Items per page |
| `status` | enum | no | Filter: `pending`, `running`, `succeeded`, `failed` |
| `project_id` | string | no | Only tasks in this marketing project |
| `hooks_only` | boolean | no | Only tasks generated with an opening hook |
