---
name: soldy
description: "Soldy AI offers two one-shot creation paths: (A) Quick Create for provider-agnostic direct video/image renders (Seedance, Kling, GPT Image 2, Gemini), and (B) a Marketing Studio / Video Ads template path for template-driven generation (UGC, UGC Try On, Unboxing, Unboxing ASMR, Direct to Camera, Testimonial, Before & After, TV Spot, Hyper Motion, Wild Concept, Model Pro Try-On, and more). Use this skill whenever the user wants to generate video ads, product videos, brand commercials, social ad creatives, product images, direct image/video renders, or any template-style ad — and whenever they mention TikTok ads, YouTube ads, Instagram Reels, ad creatives, aspect ratios, animating images, image-to-video, reference-image video, Kling, GPT Image, Gemini, quick generation, marketing studio, video ad template, UGC ad, unboxing video, tutorial video, product review video, testimonial, opening hook, or virtual try on. Also triggers on: Soldy, soldy.ai, @soldy_ai/mcp, video_list_models, video_generate, image_list_models, image_generate, plan_video_ad, list_video_ad_templates, list_video_ad_hooks, seedance_generate, Seedance, Seedance 2.0."
---

# Soldy AI

Soldy exposes **two one-shot creation paths**. Both are direct renders: submit a task, poll for the result. Pick the one that matches the user's intent; routing the wrong one wastes time on both sides.

| Path | Tool | Use when |
|---|---|---|
| **A. Quick Create** | `video_generate` / `image_generate` | The user wants one direct render/edit from a prompt + optional references. Provider-agnostic: Seedance, Kling, GPT Image 2, Gemini. Call `video_list_models` / `image_list_models` first when model/mode/params are unclear. |
| **B. Video Ad templates** | `plan_video_ad` → `seedance_generate` | The user picked (or described) a Marketing Studio template: UGC, UGC Try On, Unboxing, Unboxing ASMR, Direct to Camera, Testimonial, Before & After, TV Spot, Hyper Motion, Wild Concept, Model Pro Try-On, and more. |

Discover Quick Create models with **`video_list_models`** / **`image_list_models`**. Discover templates with **`plan_video_ad`** (live catalog + parameters + hooks + the user's avatars/products) or **`list_video_ad_templates`**. The two paths are independent.

## Path A: Quick Create (`video_*` / `image_*`)

Provider-agnostic direct generation from a prompt plus optional reference assets. `video_*` exposes Seedance 2.0, Seedance 2.0 Fast, Kling 2.6, and MiniMax H3 through the API model registry; `image_*` exposes GPT Image 2 and Gemini image models. Everything is one call to submit and a poll to retrieve — no back-and-forth.

The registry owns the valid `model`, `mode`, and parameter values. When you aren't sure which combination matches the request, call `video_list_models` / `image_list_models` first and pass the registry-owned values straight through.

```
video_list_models()                                            → model registry + modes + params
video_generate({ model, mode, prompt?, parameters?, input_assets? }) → { id }
video_get_task(task_id)                                        → status + result
image_list_models()                                            → model registry + modes + params
image_generate({ model, mode, prompt?, parameters?, input_assets? }) → { id }
image_get_task(task_id)                                        → status + result
```

Local file paths in `input_assets` are uploaded before submission; HTTP and `gs://` URLs are passed through.

## Path B: Video Ad templates (`plan_video_ad` → `seedance_generate`)

Template-driven, deterministic Video Ad generation via Seedance. The template catalog is **live and database-backed** — never hard-code it. Call `plan_video_ad` first, present the options, let the user pick, then submit one call and get back a `task_id` and a public read-only share page.

```
plan_video_ad()                                     → live templates + params + hooks + avatars + products
list_video_ad_templates()                           → the template/module catalog with descriptions
list_video_ad_hooks()                               → opening-hook library (Hooks Studio)
seedance_generate({ prompt, module, marketing_template_id, image_url, hook_id?, ... }) → { task_id, share_url }
get_seedance_task(task_id)                          → status + template + hook + result + share URL
get_seedance_share_link(task_id)                    → public read-only share URL
list_seedance_history(...)                          → render history with share links
```

There are 21 published templates, grouped into `ugc` (UGC, UGC Try On, UGC Showing Product, Unboxing, Unboxing ASMR, Direct to Camera, Routine Insert, Try It On Face, Sneakers Try-On, Testimonial, This Saved Me, Before & After, Show How It Works, Giant Figure) and `commercial` (TV Spot, Hyper Motion, Wild Concept, Product In Use, Close-Up-Detail Proof, Show the Texture, Model Pro Try-On), plus five legacy aliases and the `Direct` no-template fallback.

**Options first — do not auto-pick.** Present the templates and key parameters and let the user choose; only apply defaults if they say "you choose". `seedance_generate` also pops a confirmation form before spending credits on clients that support it.

Each live template row carries what the call needs:

| Field | Why it matters |
|---|---|
| `marketing_template_id` | Pass it alongside `module`; the backend enforces the template's hook + duration policy against it |
| `module` | The generation style (the closed `module` enum) |
| `requires_avatar` | The template needs a presenter avatar in `image_url` |
| `hook_capable` / `hook_policy` | Whether a `hook_id` is accepted, and whether only allowlisted hooks are |
| `duration_range` / `duration_range_with_hook` | The only durations the backend will accept — `-1` auto is rejected once `marketing_template_id` is set |

## Reading the user — which path fits

- **Direct render (Path A)** — "Animate this product photo into a short loop." / "Render this with Kling." / "Generate four product images." / "Edit this image to a studio background." The user wants one direct output. Call `video_list_models` or `image_list_models` if model/mode/params are unclear, then `video_generate` / `image_generate`.
- **Template-driven (Path B)** — "Make me a UGC ad for this product." / "Render an unboxing video using this photo." / "I want a testimonial style clip." / "Just run this prompt with the TV Spot template." The user named or described a Marketing Studio template. Call `plan_video_ad`, present the matching options, then `seedance_generate` with the chosen `module` + `marketing_template_id` + the product image.

When the intent is a polished, format-named ad (UGC / unboxing / testimonial / try-on / TV spot / before-and-after), prefer Path B — it's a single call to a purpose-built template. When the intent is a raw render, an edit, an image-to-video, a specific model (Kling), or a batch of images, use Path A.

## What good looks like

When a result comes back, help the user evaluate it instead of just delivering it. These are useful as a shared vocabulary for "is this any good?" for ad-style output:

| Dimension | Weight | The question it answers |
|---|---|---|
| Scroll-stopping power | 25% | Would this stop a thumb mid-scroll? |
| Message clarity | 20% | Is one viewing enough to understand it? |
| Emotional resonance | 20% | Does the viewer *feel* something? |
| Brand fit | 15% | Is it unmistakably on-brand? |
| Conversion potential | 10% | Will it drive action? |
| Shareability | 10% | Would someone send this to a friend? |

Rough heuristic: 8.0+ ships, 6.5–7.9 polishes, below that revises. Use those as a starting point for your own judgment, not a hard gate. If the user is happy at 7.4, ship.

## What to do when...

These are judgment cards, not a workflow.

- **The user says "use this image" / "animate this" / "render this."** Quick Create (Path A). Call `video_list_models` if you need a valid model/mode, then `video_generate` with the reference in `input_assets`.
- **The user named a Marketing Studio template** ("UGC ad", "unboxing", "testimonial", "try on", "TV spot", "before and after"). Path B. Call `plan_video_ad`, show the matching templates, and submit `seedance_generate` with the chosen `module` + `marketing_template_id` once the user picks.
- **The user wants a stronger opening.** Only for `hook_capable` templates: call `list_video_ad_hooks`, let them pick, and pass `hook_id`. Keep `duration` inside `duration_range_with_hook`.
- **A render came back wrong and the task is terminal.** Retry it in the same lineage with `video_retry_task` / `image_retry_task`, or resubmit with a refined prompt/parameters. For Seedance, resubmit `seedance_generate`.
- **The user wants a shareable link for a Video Ad.** Call `get_seedance_share_link(task_id)` (or read the share URL already surfaced by `seedance_generate` / `get_seedance_task`). The page is read-only.
- **The user asks "what have I rendered?"** Use `video_list_tasks` / `image_list_tasks` for Quick Create history, or `list_seedance_history` for Video Ads history.
- **You're not sure which model or mode to use.** Call `video_list_models` / `image_list_models` and pass the registry-owned `model` / `mode` / parameter values through. Don't invent them.
- **You're not sure which template value to pass as `module`.** Call `plan_video_ad` (or `list_video_ad_templates`). The `module` enum is closed and the template ids are live.

## Boundaries — what *not* to do

- Don't invent `model`, `mode`, or `parameters` values for Quick Create — discover them with `video_list_models` / `image_list_models`.
- Don't invent template `module` values or `marketing_template_id`s — the enum is closed and the ids are live; call `plan_video_ad` if unsure.
- Don't strip the `id` or the `type` role off material-library refs in `seedance_generate` `image_url` — pass `{ url, id, type: "avatar" | "product" }` through so the backend can resolve the original asset and place it correctly.
- Don't attach a `hook_id` to a template that isn't `hook_capable`, and don't send a `duration` outside the template's range — both are hard backend rejections.
- Don't poll in a tight loop. Submit, tell the user it's running (typically 1–3 minutes for video, 1–4 for image), then check.

## Tool quick reference

Full parameter docs: [references/tools.md](references/tools.md). One-line summaries grouped by path:

**Path A — Quick Create (direct, one-shot)**
- `video_list_models()` — discover available video models, modes, parameters, and asset slots.
- `video_generate({ model, mode, prompt?, parameters?, input_assets? })` — submit a direct video task (Seedance/Kling text-to-video, image-to-video, keyframes, reference-based). Returns a `vidtask_*`.
- `video_get_task(task_id)` / `video_list_tasks(...)` / `video_retry_task(task_id)` / `video_delete_task(task_id)` / `video_get_lineage(task_id)` — poll, browse, retry, delete, and trace direct video tasks.
- `image_list_models()` — discover available image models, modes, parameters, and asset slots.
- `image_generate({ model, mode, prompt?, parameters?, input_assets? })` — submit a direct image task (GPT Image 2 / Gemini text-to-image or image-to-image). Returns an `imgtask_*`.
- `image_get_task(task_id)` / `image_list_tasks(...)` / `image_retry_task(task_id)` / `image_delete_task(task_id)` / `image_get_lineage(task_id)` — poll, browse, retry, delete, and trace direct image tasks.

**Path B — Video Ads / Marketing Studio (template-driven, one-shot)**
- `plan_video_ad()` — the full live option catalog: published templates (with `marketing_template_id`, `module`, `requires_avatar`, `hook_capable`, `duration_range`), every parameter with its default, the hook library, and the user's avatars/products. Call this first.
- `list_video_ad_templates({ published_only? })` — the published template rows plus the module catalog. Each module entry's `value` is what you pass as `module`.
- `list_video_ad_hooks({ category?, limit? })` — opening hooks from Hooks Studio; pass the chosen `hook_id`.
- `seedance_generate({ prompt, image_url?, module?, marketing_template_id?, hook_id?, ratio?, ... })` — submit a Video Ad / Marketing Studio task. Returns a `task_id` and share URL immediately.
- `get_seedance_task(task_id)` — poll until `status` is `succeeded` or `failed`. Generation typically takes 1–3 minutes; returns the public read-only share URL.
- `get_seedance_share_link(task_id)` — get the web share page for a Video Ads task (`/app/share/marketing-studio/{task_id}`).
- `list_seedance_history({ page?, page_size?, status?, project_id?, hooks_only? })` — past Seedance tasks for the user, including share links.

## Aspect ratios

Pick by target platform:

| Ratio | Where it fits |
|---|---|
| `9:16` | TikTok, Reels, Shorts (vertical mobile) |
| `16:9` | YouTube, landscape |
| `1:1` | Instagram / Facebook square feed |
| `4:3` / `3:4` / `21:9` / `adaptive` | Presentations, portrait, ultra-wide cinematic, auto-fit |

For `seedance_generate`, `ratio` defaults to `9:16`. For Quick Create, the allowed ratios come from the model registry — check `video_list_models` / `image_list_models` and pass a supported value.

## Materials & references

Pass references via `input_assets` in `video_generate` / `image_generate` (registry-specific slots such as `image_url`, `video_url`, `audio_url`, `first_image_url`, `last_image_url`, `image_urls`), or via `image_url` / `video_url` / `audio_url` in `seedance_generate`. Local paths (`./product.jpg`) are auto-uploaded; HTTP and `gs://` URLs pass through. `seedance_generate` reference arrays also accept `{ url, id }` objects when the `id` came from a Soldy material list — pass the `id` through, don't strip it — and `image_url` entries take a `type` role (`"avatar"` for the presenter, `"product"` for the product) that Marketing Studio templates rely on. Batch all references into a single generation request rather than dribbling them in.

## Prerequisites

The Soldy MCP server (`@soldy_ai/mcp`) must be installed and configured with a valid API key. If `video_generate`, `seedance_generate`, etc. are not available in your session, install via the `soldy-mcp-setup` skill or directly:

```bash
npx skills add solgers/soldy-mcp@soldy-mcp-setup
```

## Deep-dive references

| Reference | When to read it |
|---|---|
| [references/tools.md](references/tools.md) | Full parameter reference for every MCP tool. |
| [references/workflows.md](references/workflows.md) | Concrete mini-workflows for each path. |
| [references/best-practices.md](references/best-practices.md) | Judgment heuristics for prompts, model selection, and reading task state. |
| [references/troubleshooting.md](references/troubleshooting.md) | Error codes and common fixes. |
