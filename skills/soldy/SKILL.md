---
name: soldy
description: "Soldy AI is an autonomous creative production studio that turns product/brand context into broadcast-quality video ads, social ad images, and brand identities. Use this skill when the user wants to: generate video ads for TikTok, YouTube, Instagram, or any platform; create product videos or brand commercials; extract brand identity from a URL; produce social media ad creatives; make narrative/story-driven ads, comedic ads, or emotional ads; create product shots or lifestyle imagery; iterate on creative direction, storyboards, or scripts; manage video generation projects; check generation progress or retrieve final assets. Also triggers on: Soldy, soldy.ai, @soldy_ai/mcp, create_project, send_message, extract_brand, watch_project, get_project_materials, video ad, product video, brand video, TikTok ad, YouTube ad, Instagram Reels, ad creative, storyboard, shot list, aspect ratio."
---

# Soldy AI

Soldy is an autonomous creative director — a multi-phase production studio that takes product/brand context and user intent, then autonomously produces scripts, storyboards, and final video/image assets through choreographed production phases with quality gates and user approvals.

**What Soldy produces:**
- Video ads (TikTok, YouTube, Instagram Reels, Shorts, etc.)
- Social media ad images
- Brand identity extraction (colors, tone, positioning)
- Product photography and lifestyle shots
- Music and soundtracks for video content

**How it works:** You communicate with Soldy through its MCP server (`@soldy_ai/mcp`). The MCP is a bridge — behind it, a full creative production team (director, DP, gaffer, production designer, music director) orchestrates your project through structured phases.

## Prerequisites

The Soldy MCP server (`@soldy_ai/mcp`) must be installed and configured with a valid API key. If Soldy tools (`create_project`, `send_message`, `extract_brand`, etc.) are not available in your current session, the MCP server is not installed yet.

**To install:** Follow the `soldy-mcp-setup` skill — it covers Claude Code, Claude Desktop, Cursor, Codex, and Gemini CLI. You can also install it directly:

```bash
npx skills add solgers/soldy-mcp@soldy-mcp-setup
```

## When to Use Soldy

| User Intent | What Soldy Does |
|-------------|----------------|
| "Make a TikTok ad for my product" | Full video pipeline: brand extraction → creative direction → script → storyboard → video → music → final cut |
| "I need a product video" | Product-centric commercial with 4-view reference, cinematography, sound design |
| "Create a funny ad / emotional ad" | Narrative pipeline with tension architecture, cast design, escalation curves |
| "Extract my brand from this URL" | Auto-extract colors, tone, positioning, visual identity from product pages |
| "Make social media creatives" | Static ad images optimized for Instagram, Facebook, TikTok |
| "Adapt this to different platforms" | Format adaptation: 16:9 → 9:16 → 1:1 with smart recomposition |
| "Improve this video / change the style" | Targeted iteration at shot, sequence, or creative-direction level |

## Core Workflow

### Quick Start (3 steps)

```
1. create_project(name) → project_id
2. send_message(project_id, content, ratio, material_urls?, brand_id?)
3. watch_project(project_id) → wait for completion → get_project_materials(project_id)
```

### Full Workflow (recommended)

```
Step 1: Brand Setup (when user has a product URL)
  extract_brand(product_url) → task_id
  watch_brand_task(task_id) → wait → get brand_id
  ↳ Extracts: brand colors, tone, positioning, visual identity

Step 2: Create Project
  create_project(name, brand_id?, ratio?)

Step 3: Generate
  send_message(project_id, content, ratio, material_urls?, brand_id?)
  ↳ Behind the scenes, Soldy runs the full production pipeline

Step 4: Monitor
  watch_project(project_id) → wait for resource notifications
  Status guide:
    "running"   → production in progress (can take several minutes)
    "pause"     → credits/approval needed → continue_project(project_id)
    "error"     → check error, retry with new send_message
    "completed" → assets ready

Step 5: Get Results
  get_project_materials(project_id)
  ↳ Returns: videos, images, audio, documents with URLs and thumbnails

Step 6: Iterate
  send_message(project_id, "adjust style / change duration / redo music / ...")
  ↳ Soldy refines without starting from scratch
```

## What Happens Behind the MCP

When you call `send_message`, Soldy's agent runs a multi-phase production pipeline:

### Phase 1: Creative Direction
A simulated creative team (Product Manager, Visual Artist, Creative Director, Director) diagnoses the product and locks ONE production direction — including video thesis, product role, environment strategy, rhythm shape, and a "killer shot" concept.

### Phase 2: Visual Foundation
- **Product Four-View**: Standardized multi-angle product reference (locks geometry, colors, materials)
- **Character Design**: If characters needed — memorable via contrast principle (gap between expectation and reality)
- **Color Bible**: Mood board + 4 HEX palette (Primary, Secondary, Accent, Shadow) — carried through all downstream generation

### Phase 3: Script & Storyboard
- **Shot Script Table**: Per-shot cinematography (scale, angle, lens, focus, composition, movement, lighting, sound, VO)
- **DP Selection**: Matched to creative direction (Doyle, Lubezki, Hoytema, Fraser, etc.)
- **Storyboard Frames**: Generated per shot using reference images as anchors

### Phase 4: Video Generation
- Multi-route concurrent I2V/T2V via **Kling v2.6 Pro** (default)
- Alternative engines: **Seedance 2.0** (advanced, opt-in), **LTX-2** (extension)
- Color consistency enforced via HEX anchors from Color Bible

### Phase 5: Audio & Music
- AI-composed soundtrack — two strategies:
  - **Beat-Driven** (product videos): unified tone, steady rhythm
  - **Cinematic** (story ads): emotional dynamics following plot arc

### Phase 6: Final Delivery & Quality Gate
- Video merge (all clips + music)
- **6-Dimension Evaluation**: Scroll-stopping power (25%), Message clarity (20%), Emotional resonance (20%), Brand fit (15%), Conversion potential (10%), Shareability (10%)
- Score 8.0+ → ship; 6.5-7.9 → minor polish; <6.5 → revise

## Production Types

### Product Video (PV)
Product-centric showcase. No characters by default. Best for e-commerce launches, brand hero videos, demonstration ads.

### Narrative / Story Video
Character-driven content with four narrative intent modes:

| Intent | Style | Best For |
|--------|-------|----------|
| Emotional | Value-change driven, slow-burn arcs | Brand storytelling, testimonials |
| Comedic | Chaos escalation, 10x character contrast | Viral content, social sharing |
| Cultural | Zeitgeist-responsive, meme potential | Trend-riding, cultural moments |
| Conversion | Barrier-dismantling, urgency-building | Direct-response, ROAS-focused |

Soldy auto-detects the narrative intent and applies matching tension architecture, escalation curves, and cast design intensity.

### Social Ad Images
Static ad creatives for Instagram, Facebook, TikTok. Pipeline: reference images → composition → copy generation → image render → quality gate.

### Product Shots
E-commerce product photography, lifestyle staging, multi-angle presentations.

## Aspect Ratio Guide

Choose `ratio` based on target platform:

| Ratio | Platform | Use Case |
|-------|----------|----------|
| `9:16` | TikTok, Reels, Shorts | Vertical mobile-first |
| `16:9` | YouTube, landscape | Standard widescreen |
| `1:1` | Instagram, Facebook | Square social feed |
| `4:3` | Presentations | Traditional format |
| `3:4` | Pinterest, portrait | Vertical portrait |
| `3:2` | Photography | Standard photo |
| `2:3` | Tall vertical | Mobile portrait |
| `21:9` | Cinema, ultra-wide | Cinematic premium |

**Format Adaptation**: After generating one ratio, ask Soldy to adapt to others — it intelligently recomposes (not just crops).

## Writing Effective Prompts

### Product Video Prompt
```
Create a 20-second product video for [product name].
Focus on [key feature/benefit].
Target platform: TikTok.
Tone: premium/minimal.
```

### Story Ad Prompt
```
Create a funny 15-second ad for [product].
A [character type] discovers [product] in [unexpected situation].
Target: Instagram Reels.
```

### Brand Video Prompt
```
Create a brand manifesto video for [brand].
Show the brand's origin story and values.
30 seconds, cinematic style.
Target: YouTube.
```

### Iteration Prompt
```
Redo shot 3 with warmer lighting.
Change the music to something more upbeat.
Make the ending more dramatic.
Adapt this to 9:16 for TikTok.
```

## Materials & File Handling

Pass reference materials via `material_urls` in `send_message`:

- **Local files** (`./product.jpg`, `/path/to/video.mp4`) — auto-uploaded
- **HTTP URLs** (`https://example.com/photo.jpg`) — passed directly
- **GCS URLs** (`gs://bucket/file`) — passed directly

Supported: images, videos, audio files. Multiple files can be passed as an array.

## Key Rules

1. **`ratio` is required** in `send_message` — always choose based on target platform
2. **Always pass `brand_id`** when a brand exists — it provides color/tone/positioning context
3. **Use `extract_brand` explicitly** — product URLs in text are NOT auto-extracted
4. **Prefer subscriptions** — `watch_project` over polling `get_project_status`
5. **Brand extraction takes 30-60s** — always monitor async with `watch_brand_task`
6. **Complex videos take minutes** — the agent runs full production pipeline (creative → script → storyboard → video → music → merge)
7. **Iterate, don't restart** — send new messages to the same project to refine

## Agent Compatibility

| Agent | Subscriptions | Monitoring Strategy |
|-------|--------------|-------------------|
| Claude Code / Desktop | Full support | Use `watch_project` and `watch_brand_task` for real-time updates |
| Cursor | May not support | Try `watch_project` first; fall back to polling `get_project_status` every 5-10s |
| Codex | Not supported | Poll `get_project_status` every 5-10s until status is `completed` or `error` |
| Gemini CLI | Not supported | Poll `get_project_status` every 5-10s until status is `completed` or `error` |

When subscriptions are not available, use this polling pattern:
```
send_message(project_id, content, ratio)
loop:
  wait 5-10 seconds
  get_project_status(project_id)
  if status == "completed" → get_project_materials(project_id) → done
  if status == "error" → report error → done
  if status == "pause" → continue_project(project_id)
```

## Deep-Dive References

| Reference | When to Read |
|-----------|-------------|
| [references/tools.md](references/tools.md) | Full parameter reference for all 17 MCP tools |
| [references/resources.md](references/resources.md) | Resource URIs, subscription patterns, real-time monitoring |
| [references/workflows.md](references/workflows.md) | Detailed production pipeline phases, iteration levels, quality gates |
| [references/best-practices.md](references/best-practices.md) | Prompt engineering, workflow patterns, anti-patterns, performance tips |
| [references/troubleshooting.md](references/troubleshooting.md) | Error codes, common issues, and fixes |
