# Soldy MCP — Workflows

Concrete mini-workflows for the two one-shot creation paths. Both submit a task and poll for the result.

| Path | First call | Submit | Poll |
|---|---|---|---|
| **Quick Create — video** | `video_list_models` | `video_generate` | `video_get_task` |
| **Quick Create — image** | `image_list_models` | `image_generate` | `image_get_task` |
| **Marketing Studio — Video Ad** | `list_video_ad_templates` | `seedance_generate` | `get_seedance_task` |

---

## Path A: Quick Create (`video_*` / `image_*`)

Use these when the user wants one direct render or edit from a prompt and optional references, provider-agnostic. Call the `*_list_models` tool first whenever the model, mode, or parameter values are unclear — the registry owns the valid combinations. Pass registry-owned values straight through.

### Mini-workflow: Kling image-to-video

```
1. video_list_models() -> find model "kling-2.6" and mode "image_to_video"
2. video_generate(
     model: "kling-2.6",
     mode: "image_to_video",
     prompt: "cinematic 5s orbit shot, premium product lighting",
     input_assets: { image_url: ["https://..."] },
     parameters: { duration: 5, ratio: "9:16", generate_audio: true }
   )
3. video_get_task(task_id) until status is succeeded or failed
4. use video_get_lineage / video_retry_task for retry review and recovery
```

### Mini-workflow: Seedance text-to-video

```
1. video_list_models() -> find model "seedance-2.0" and mode "text_to_video"
2. video_generate(
     model: "seedance-2.0",
     mode: "text_to_video",
     prompt: "a sleek smartwatch rotating on a dark reflective surface",
     parameters: { duration: 8, ratio: "9:16", resolution: "1080p" }
   )
3. video_get_task(task_id) until status is succeeded or failed
```

### Mini-workflow: GPT Image 2 product shot

```
1. image_list_models() -> find model "gpt-image-2" and mode "text_to_image"
2. image_generate(
     model: "gpt-image-2",
     mode: "text_to_image",
     prompt: "studio product photo on a brushed steel surface",
     parameters: { image_size: "portrait_9_16", quality: "high", num_images: 2 }
   )
3. image_get_task(task_id) until status is succeeded or failed
```

### Mini-workflow: Gemini image edit (image-to-image)

```
1. image_list_models() -> find a Gemini model and mode "image_to_image"
2. image_generate(
     model: "gemini-3-pro-image-preview",
     mode: "image_to_image",
     prompt: "replace the background with a soft gradient studio backdrop",
     input_assets: { image_urls: ["./product.jpg"] }
   )
3. image_get_task(task_id) until status is succeeded or failed
```

Local file paths (`./product.jpg`) are uploaded before the request; HTTP and `gs://` URLs pass through. Browse history with `video_list_tasks` / `image_list_tasks`; retry terminal tasks with `video_retry_task` / `image_retry_task`; trace a lineage with `video_get_lineage` / `image_get_lineage`.

---

## Path B: Marketing Studio / Video Ads (`seedance_generate`)

Use this when the user named or described a Video Ad template. One call renders a complete, polished ad from a template + product image + short prompt, and returns a public read-only share page.

### Mini-workflow: UGC ad from a product image

```
1. list_video_ad_templates()  (only if you're unsure of the exact module value)
2. seedance_generate(
     prompt: "energetic creator raving about these earbuds while walking",
     module: "UGC",
     image_url: ["https://.../earbuds.jpg"],
     ratio: "9:16",
     duration: 10
   )
   -> returns { task_id, status } and a public share URL immediately
3. get_seedance_task(task_id) until status is succeeded or failed
4. get_seedance_share_link(task_id) to hand the user a read-only link
```

### Mini-workflow: Unboxing video

```
1. seedance_generate(
     prompt: "premium unboxing, hands revealing the product on a clean desk",
     module: "Unboxing",
     image_url: ["https://.../box.jpg"],
     resolution: "1080p"
   )
2. get_seedance_task(task_id) until done
```

### Picking the module

If the user described a *style* but not an exact template name, call `list_video_ad_templates` to see the catalog with descriptions and pick the closest match — surface 2–3 options only when the match is genuinely ambiguous. The `module` enum is closed:

| Module | Best for |
|---|---|
| `UGC` | Authentic user-style content |
| `Tutorial` | Step-by-step tutorials |
| `Unboxing` | High-quality unboxing |
| `Hyper_Motion` | Hyper-motion energy highlight |
| `Product_Review` | Authentic product review |
| `TV_Spot` | Broadcast-quality amplification |
| `Wild_Card` | Custom creative ideas |
| `UGC_Virtual_Try_On` | Try-before-you-buy, UGC style |
| `Pro_Virtual_Try_On` | Polished virtual try-on |
| `Direct` | No template — runs from prompt + media directly |

### Reference handling

`image_url`, `video_url`, and `audio_url` accept plain URL strings *or* `{ url, id }` objects. Use the `{ url, id }` form when the `id` came from a Soldy material list — pass the `id` through so the backend can resolve the original asset; don't strip it. Local paths are auto-uploaded.

### History

Use `list_seedance_history` (optional `status` filter) when the user asks "what have I rendered?" — rows include the same share links as `get_seedance_share_link`.
