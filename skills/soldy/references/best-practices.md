# Soldy — Judgment Heuristics

The main SKILL.md gives you the mental model. This document is the deeper-cut version: heuristics for the recurring judgment calls you'll make while driving Soldy's two one-shot paths on behalf of a user. None of this is a script — it's all "here's how to think about it."

## Picking the path

The first judgment call is always: **Quick Create or Marketing Studio?**

**Signals for Quick Create (`video_*` / `image_*`):**
- "Animate this photo." / "Turn this image into a short loop." / "Make a 5-second video from this reference."
- A named model or mode: "render this with Kling", "use GPT Image 2", "image-to-video".
- A raw render or edit with no ad framing: "generate four product images", "edit this to a white background".
- The user wants control over model, resolution, duration, or reference slots directly.

**Signals for Marketing Studio (`seedance_generate`):**
- A format-named ad: "UGC ad", "unboxing video", "testimonial", "try on", "TV spot", "before and after", "product demo".
- The user has a product image and just wants a finished, polished ad in one shot.
- They described a marketing *style* without naming a model — let the template do the work.

When in doubt between a template and a raw render, ask which the user cares more about: a purpose-built ad format (Marketing Studio) or exact model/parameter control (Quick Create).

## Discovering valid values before you submit

Both paths have closed vocabularies. Don't guess.

- **Quick Create** — call `video_list_models` / `image_list_models` first whenever the `model`, `mode`, or parameter values are unclear. The registry is API-owned and changes per API key (Seedance, Kling, GPT Image 2, Gemini are enabled selectively). Pass the registry-owned values straight through; top-level convenience fields (`duration`, `ratio`, `resolution`, etc.) override duplicates inside `parameters`.
- **Marketing Studio** — the `module` enum is closed and the template catalog is live. Call `plan_video_ad` first and present the options; the user picks the template and parameters, not you. If they described a style but didn't name a template, offer the closest 2–3 matches from the catalog. Pass both `module` and `marketing_template_id` on submit.

## Phrasing a prompt

State *what matters and why*; leave the *how* to the model. A good prompt reads like creative intent, not a JIRA ticket.

**Good (Quick Create video):**

```
cinematic 5s orbit shot of the earbuds, premium product lighting, shallow depth of field
```

**Good (Marketing Studio UGC):**

```
energetic creator raving about these earbuds while walking through a city at golden hour
```

**Over-prescriptive (avoid):**

```
Shot 1: close-up on white background, 3s, fade in from black. Shot 2: person inserts
earbud, medium shot, 4s. Shot 3: noise-cancel icon with text overlay...
```

Micro-directing a single-shot render throws away what the model is good at. If the user genuinely wants that level of control, that's a deliberate choice — not the default. For structural control, prefer the right `mode` (keyframes, references, image-to-video) and reference assets over a wall of shot instructions.

## Reference handling

- **Batch references.** Pass all reference images/videos/audio in one generation request, not across several. In Quick Create they go in `input_assets` under registry-specific slots (`image_url`, `video_url`, `audio_url`, `first_image_url`, `last_image_url`, `image_urls`); in Marketing Studio they go in `image_url` / `video_url` / `audio_url`.
- **Local paths auto-upload.** `./product.jpg` is uploaded before submission; HTTP and `gs://` URLs pass through untouched.
- **Preserve material-library `id`s and roles.** In `seedance_generate`, reference arrays accept `{ url, id }` objects. When the `id` came from a Soldy material list, pass it through — don't collapse it to a bare URL string, or the backend can't resolve the original asset. On `image_url`, also tag the role: `type: "avatar"` for the presenter, `type: "product"` for the product. Templates with `requires_avatar` need an avatar reference.

- **Respect the template's limits.** Keep `duration` inside the template's `duration_range` (`duration_range_with_hook` when a hook is attached), and only attach a `hook_id` to a `hook_capable` template. The backend rejects both violations outright rather than clamping.
- **Match the mode to the reference.** An image-to-video request needs a mode that consumes an image slot; a text-to-video request doesn't. `video_list_models` tells you which modes exist and what slots they read.

## Reading task state

Both paths are submit-then-poll. Map status to action:

| Status | What it means | What to do |
|---|---|---|
| `pending` / `running` | The task is queued or generating. | Keep watching. Tell the user it's still going (video ~1–3 min, image ~1–4 min). |
| `succeeded` | The result is ready. | Surface the result JSON and, for Video Ads, the share URL. |
| `failed` | Generation failed. | Read the error / failure reason. Retry the terminal task, or resubmit with a refined prompt/parameters. |

Don't poll in a tight loop — submit, tell the user it's running, then check back.

## Retry vs. resubmit

- **Retry (same lineage)** — for Quick Create, `video_retry_task` / `image_retry_task` re-runs a *terminal* task with the same inputs and keeps it in the same lineage/gallery. Use it for transient failures or to get another sample of the same request. Trace attempts with `video_get_lineage` / `image_get_lineage`.
- **Resubmit (new task)** — when the prompt, model, mode, references, or parameters need to change, submit a fresh `video_generate` / `image_generate` / `seedance_generate` call. Seedance has no retry tool; a bad Video Ad is a fresh `seedance_generate`.

Only terminal tasks can be retried or deleted — the API rejects retry/delete on a running task.

## Performance heuristics

- **Discover once, reuse the values.** Call `video_list_models` / `image_list_models` when you're unsure, then reuse the model/mode/params across similar requests in the session.
- **Batch materials.** One request with all references beats several requests with one each.
- **Let generation finish.** Don't resubmit while a task is still running — the in-flight work is wasted.
- **Hand over the share link.** For Video Ads, `get_seedance_task` and `seedance_generate` already surface a read-only share URL; `get_seedance_share_link` regenerates it for any task from `list_seedance_history`.

## Common anti-patterns

- **Guessing `model` / `mode` / `parameters`.** Discover them with `video_list_models` / `image_list_models`. Invented values fail.
- **Guessing a template `module` or `marketing_template_id`.** The enum is closed and the ids are live; call `plan_video_ad` if unsure.
- **Auto-picking the template and parameters.** Marketing Studio is options-first — present and let the user choose unless they explicitly said "you choose".
- **Routing a format-named ad through Quick Create.** "Make me a UGC ad" is Marketing Studio — the template does more than a raw render.
- **Routing a raw render or specific-model request through Marketing Studio.** "Render this with Kling" is Quick Create.
- **Stripping `id`s or `type` roles off material-library refs.** Pass `{ url, id, type }` through in `seedance_generate`.
- **Writing shot-by-shot prompts for a single render.** Describe outcomes; pick the right mode and references for structure.
- **Tight polling loops.** Submit, inform the user, then check.
