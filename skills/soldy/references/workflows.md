# Soldy MCP — Workflows

Concrete mini-workflows for the two one-shot creation paths. Both submit a task and poll for the result.

| Path | First call | Submit | Poll |
|---|---|---|---|
| **Quick Create — video** | `video_list_models` | `video_generate` | `video_get_task` |
| **Quick Create — image** | `image_list_models` | `image_generate` | `image_get_task` |
| **Marketing Studio — Video Ad** | `plan_video_ad` | `seedance_generate` | `get_seedance_task` |

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

## Path B: Marketing Studio / Video Ads (`plan_video_ad` → `seedance_generate`)

Use this when the user named or described a Video Ad template. One call renders a complete, polished ad from a template + product image + short prompt, and returns a public read-only share page.

**Options first.** The template catalog is live and database-backed. Call `plan_video_ad`, present the options, and let the user choose the template and the parameters — only apply defaults if they explicitly say "you choose". `seedance_generate` also pops a confirmation form before spending credits on clients that support elicitation.

### Mini-workflow: UGC ad from a product image

```
1. plan_video_ad()
   -> present the templates (grouped by category), the parameters, and the
      user's avatars/products; let the user pick
2. seedance_generate(
     prompt: "energetic creator raving about these earbuds while walking",
     module: "UGC",
     marketing_template_id: "mktpl_...",            // the row the user picked
     image_url: [
       { url: "https://.../earbuds.jpg", id: "mlib_...", type: "product" },
       { url: "https://.../avatar.jpg",  id: "mlib_...", type: "avatar" }
     ],
     ratio: "9:16",
     duration: 10                                   // inside duration_range
   )
   -> confirmation form, then { task_id, status } and a public share URL
3. get_seedance_task(task_id) until status is succeeded or failed
4. get_seedance_share_link(task_id) to hand the user a read-only link
```

### Mini-workflow: hooked testimonial

```
1. plan_video_ad()
   -> user picks "Testimonial" (hook_capable: true, hook_policy: "inherit")
2. list_video_ad_hooks({ category: "trust_building" })
   -> user picks a hook
3. seedance_generate(
     prompt: "long-time customer explaining why they still use it",
     module: "Testimonial",
     marketing_template_id: "mktpl_...",
     hook_id: "hookt_...",
     image_url: [{ url: "https://.../avatar.jpg", id: "mlib_...", type: "avatar" }],
     duration: 12                                   // inside duration_range_with_hook
   )
4. get_seedance_task(task_id) until done
```

### Mini-workflow: Unboxing video

```
1. plan_video_ad()  -> user picks "Unboxing"
2. seedance_generate(
     prompt: "premium unboxing, hands revealing the product on a clean desk",
     module: "Unboxing",
     marketing_template_id: "mktpl_...",
     image_url: [{ url: "https://.../box.jpg", id: "mlib_...", type: "product" }],
     resolution: "1080p"
   )
3. get_seedance_task(task_id) until done
```

### Picking the module

If the user described a *style* but not an exact template name, use the `plan_video_ad` catalog (or `list_video_ad_templates`) to pick the closest match — surface 2–3 options only when the match is genuinely ambiguous. The `module` enum is closed:

| Category | Module | Best for |
|---|---|---|
| ugc | `UGC` | Authentic creator-style content |
| ugc | `UGC_Try_On` | Casual creator trying on the product |
| ugc | `UGC_Showing_Product` | Creator-style product videos |
| ugc | `Unboxing` | Exciting product reveal |
| ugc | `Unboxing_ASMR` | Satisfying unboxing with immersive sound |
| ugc | `Direct_To_Camera` | Creator speaking straight to camera |
| ugc | `Testimonial` | Customer testimonial delivered to camera |
| ugc | `This_Saved_Me` | Benefits as a personal success story |
| ugc | `Routine_Insert` | Product blended into an everyday routine |
| ugc | `Try_It_On_Face` | Product previewed directly on the face |
| ugc | `Sneakers_Try_On` | Sneakers showcased naturally on feet |
| ugc | `Show_How_It_Works` | Step-by-step product demonstration |
| ugc | `Before_After` | Visible transformation before and after use |
| ugc | `Giant_Figure` | Oversized, scroll-stopping product moments |
| commercial | `TV_Spot` | Cinematic brand-style commercial |
| commercial | `Hyper_Motion` | High-energy product motion bursts |
| commercial | `Wild_Concept` | Bold ideas as impossible product ads |
| commercial | `Model_Pro_Try_On` | Professional model showcasing the product |
| commercial | `Product_First` | Product naturally used in everyday moments |
| commercial | `Close_Up_Detail_Proof` | Close-up details that build confidence |
| commercial | `Show_The_Texture` | Close-up texture and finish reveal |
| — | `Direct` | No template — runs from prompt + media directly |

Legacy aliases still accepted for older tasks: `Tutorial`, `Product_Review`, `Wild_Card`, `UGC_Virtual_Try_On`, `Pro_Virtual_Try_On`. Prefer a current module for new renders.

### Reference handling

`image_url`, `video_url`, and `audio_url` accept plain URL strings *or* `{ url, id }` objects. Use the `{ url, id }` form when the `id` came from a Soldy material list — pass the `id` through so the backend can resolve the original asset; don't strip it. On `image_url`, add the Marketing Studio role: `type: "avatar"` for the presenter, `type: "product"` for the product. Templates with `requires_avatar` need an avatar reference. Local paths are auto-uploaded.

### Duration and hooks

The chosen template owns the duration window. Keep `duration` inside `duration_range`, or `duration_range_with_hook` when you attach a `hook_id`; `-1` (auto) is rejected once `marketing_template_id` is set. Only `hook_capable` templates accept a hook, and a template whose `hook_policy` is `allowlist` accepts only its listed hooks. Both violations are hard backend rejections, not silent fallbacks.

### History

Use `list_seedance_history` (optional `status`, `project_id`, `hooks_only` filters) when the user asks "what have I rendered?" — rows include the same share links as `get_seedance_share_link`.
