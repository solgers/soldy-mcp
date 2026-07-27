# Soldy MCP — Tool Reference

Complete parameter reference for every MCP tool exposed by `@soldy_ai/mcp`. There are two paths: **Quick Create** (`video_*` / `image_*`) and **Marketing Studio / Video Ads** (`seedance_*` / `list_video_ad_templates`).

---

## Quick Create — Video (`video_*`)

Provider-agnostic direct video generation through the API model registry (Seedance 2.0, Seedance 2.0 Fast, and Kling 2.6 when enabled for the API key).

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
| `model` | string | yes | Registry id from `image_list_models`, e.g. `gpt-image-2`, `gemini-3-pro-image-preview` |
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

## Marketing Studio / Video Ads (`seedance_*`)

Template-driven, one-shot Video Ad generation via Seedance. Returns a `task_id` and a public read-only share link immediately.

### list_video_ad_templates

List the available Video Ad / Marketing Studio templates. Each entry's `value` is what you pass as `module` to `seedance_generate`. The list is small and stable; you can also pass `module` directly if you already know the value.

No parameters. Returns the catalog as JSON: `[{ value, name, description }]`.

Template values: `UGC`, `Tutorial`, `Unboxing`, `Hyper_Motion`, `Product_Review`, `TV_Spot`, `Wild_Card`, `UGC_Virtual_Try_On`, `Pro_Virtual_Try_On`, and `Direct` (default fallback — runs from prompt + media with no template preset).

### seedance_generate

Submit a Video Ad / Marketing Studio task. Pick a `module` template and attach product/avatar references in `image_url`.

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `prompt` | string | yes | Generation prompt |
| `image_url` | array | no | Reference image(s). Plain URL strings, or `{ url, id }` objects where `id` references an item from the user's material library. Pass the `id` through when you have it. |
| `video_url` | array | no | Reference video(s). Same shape as `image_url`. |
| `audio_url` | array | no | Reference audio track(s). Same shape as `image_url`. |
| `duration` | number | no | Seconds: `-1` (auto) or 4–15. Default 10. |
| `ratio` | enum | no | `16:9` `4:3` `1:1` `3:4` `9:16` `21:9` `adaptive`. Default `9:16`. |
| `input_ratio` | enum | no | Input reference aspect ratio. When set, the backend uses this in place of `ratio` downstream. Same allowed values as `ratio`. |
| `model` | enum | no | `doubao-seedance-2-0-260128` (default) or `doubao-seedance-2-0-fast-260128` |
| `resolution` | enum | no | `480p` `720p` `1080p`. Default `720p`. |
| `module` | enum | no | `Direct` (default; no template), `UGC`, `Tutorial`, `Unboxing`, `Hyper_Motion`, `Product_Review`, `TV_Spot`, `Wild_Card`, `UGC_Virtual_Try_On`, `Pro_Virtual_Try_On` |
| `callback_url` | string | no | Optional HTTPS URL for Volcano Ark task callbacks (http allowed for localhost) |

Returns a `task_id`, `status`, and a public share URL. Poll with `get_seedance_task`. Generation typically takes 1–3 minutes.

### get_seedance_task

Poll a Seedance task by ID. Returns `status` (`pending` / `running` / `succeeded` / `failed`), the public read-only share URL, credits charged, and the result JSON when done.

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
