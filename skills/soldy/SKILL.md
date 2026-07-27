---
name: soldy
description: "Soldy AI offers two one-shot creation paths: (A) Quick Create for provider-agnostic direct video/image renders (Seedance, Kling, GPT Image 2, Gemini), and (B) a Marketing Studio / Video Ads template path for template-driven generation (UGC, Unboxing, Tutorial, Product Review, TV Spot, Hyper Motion, Wild Card, Virtual Try On). Use this skill whenever the user wants to generate video ads, product videos, brand commercials, social ad creatives, product images, direct image/video renders, or any template-style ad — and whenever they mention TikTok ads, YouTube ads, Instagram Reels, ad creatives, aspect ratios, animating images, image-to-video, reference-image video, Kling, GPT Image, Gemini, quick generation, marketing studio, video ad template, UGC ad, unboxing video, tutorial video, product review video, or virtual try on. Also triggers on: Soldy, soldy.ai, @soldy_ai/mcp, video_list_models, video_generate, image_list_models, image_generate, list_video_ad_templates, seedance_generate, Seedance, Seedance 2.0."
---

# Soldy AI

Soldy exposes **two one-shot creation paths**. Both are direct renders: submit a task, poll for the result. Pick the one that matches the user's intent; routing the wrong one wastes time on both sides.

| Path | Tool | Use when |
|---|---|---|
| **A. Quick Create** | `video_generate` / `image_generate` | The user wants one direct render/edit from a prompt + optional references. Provider-agnostic: Seedance, Kling, GPT Image 2, Gemini. Call `video_list_models` / `image_list_models` first when model/mode/params are unclear. |
| **B. Video Ad templates** | `seedance_generate` + `module` | The user picked (or described) a Marketing Studio template: UGC, Unboxing, Tutorial, Product Review, TV Spot, Hyper Motion, Wild Card, Virtual Try On. |

Discover Quick Create models with **`video_list_models`** / **`image_list_models`**. Discover template values with **`list_video_ad_templates`**. The two paths are independent.

## Path A: Quick Create (`video_*` / `image_*`)

Provider-agnostic direct generation from a prompt plus optional reference assets. `video_*` exposes Seedance 2.0, Seedance 2.0 Fast, and Kling 2.6 through the API model registry; `image_*` exposes GPT Image 2 and Gemini image models. Everything is one call to submit and a poll to retrieve — no back-and-forth.

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

## Path B: Video Ad templates (`seedance_generate`)

Template-driven, deterministic Video Ad generation via Seedance. Pick a `module` template, attach a product/avatar image, submit one call, and get back a `task_id` and a public read-only share page. Templates: UGC, Tutorial, Unboxing, Hyper Motion, Product Review, TV Spot, Wild Card, UGC Virtual Try On, Pro Virtual Try On (plus the `Direct` no-template fallback).

```
list_video_ad_templates()                          → the module catalog with descriptions
seedance_generate({ prompt, module, image_url, ... }) → { task_id, share_url }
get_seedance_task(task_id)                          → status + result + share URL
get_seedance_share_link(task_id)                    → public read-only share URL
list_seedance_history(...)                          → render history with share links
```

This is the right call when the user named or described a Marketing Studio template. If the format is ambiguous, call `list_video_ad_templates` and pick the closest match, surfacing 2–3 options only when the match is genuinely unclear.

## Reading the user — which path fits

- **Direct render (Path A)** — "Animate this product photo into a short loop." / "Render this with Kling." / "Generate four product images." / "Edit this image to a studio background." The user wants one direct output. Call `video_list_models` or `image_list_models` if model/mode/params are unclear, then `video_generate` / `image_generate`.
- **Template-driven (Path B)** — "Make me a UGC ad for this product." / "Render an unboxing video using this photo." / "I want a product review style clip." / "Just run this prompt with the TV Spot template." The user named a Marketing Studio template. Call `list_video_ad_templates` if you're unsure of the exact `module` value, then `seedance_generate` with the matching `module` + the product image.

When the intent is a polished, format-named ad (UGC / unboxing / product review / tutorial / TV spot / virtual try on), prefer Path B — it's a single call to a purpose-built template. When the intent is a raw render, an edit, an image-to-video, a specific model (Kling), or a batch of images, use Path A.

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
- **The user named a Marketing Studio template** ("UGC ad", "unboxing", "product review", "tutorial", "TV spot", "virtual try on"). Path B. Call `seedance_generate` with the matching `module` directly. If the template name is ambiguous, call `list_video_ad_templates` first.
- **A render came back wrong and the task is terminal.** Retry it in the same lineage with `video_retry_task` / `image_retry_task`, or resubmit with a refined prompt/parameters. For Seedance, resubmit `seedance_generate`.
- **The user wants a shareable link for a Video Ad.** Call `get_seedance_share_link(task_id)` (or read the share URL already surfaced by `seedance_generate` / `get_seedance_task`). The page is read-only.
- **The user asks "what have I rendered?"** Use `video_list_tasks` / `image_list_tasks` for Quick Create history, or `list_seedance_history` for Video Ads history.
- **You're not sure which model or mode to use.** Call `video_list_models` / `image_list_models` and pass the registry-owned `model` / `mode` / parameter values through. Don't invent them.
- **You're not sure which template value to pass as `module`.** Call `list_video_ad_templates`. The `module` enum is closed.

## Boundaries — what *not* to do

- Don't invent `model`, `mode`, or `parameters` values for Quick Create — discover them with `video_list_models` / `image_list_models`.
- Don't invent template `module` values — the enum is closed; call `list_video_ad_templates` if unsure.
- Don't strip the `id` off material-library refs in `seedance_generate` `image_url` — pass `{ url, id }` through so the backend can resolve the original asset.
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
- `list_video_ad_templates()` — discover available templates (UGC, Tutorial, Unboxing, Hyper_Motion, Product_Review, TV_Spot, Wild_Card, UGC_Virtual_Try_On, Pro_Virtual_Try_On, Direct). Each entry's `value` is what you pass as `module`.
- `seedance_generate({ prompt, image_url?, module?, ratio?, ... })` — submit a Video Ad / Marketing Studio task. Returns a `task_id` and share URL immediately.
- `get_seedance_task(task_id)` — poll until `status` is `succeeded` or `failed`. Generation typically takes 1–3 minutes; returns the public read-only share URL.
- `get_seedance_share_link(task_id)` — get the web share page for a Video Ads task (`/app/share/marketing-studio/{task_id}`).
- `list_seedance_history(...)` — past Seedance tasks for the user, including share links.

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

Pass references via `input_assets` in `video_generate` / `image_generate` (registry-specific slots such as `image_url`, `video_url`, `audio_url`, `first_image_url`, `last_image_url`, `image_urls`), or via `image_url` / `video_url` / `audio_url` in `seedance_generate`. Local paths (`./product.jpg`) are auto-uploaded; HTTP and `gs://` URLs pass through. `seedance_generate` reference arrays also accept `{ url, id }` objects when the `id` came from a Soldy material list — pass the `id` through, don't strip it. Batch all references into a single generation request rather than dribbling them in.

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
