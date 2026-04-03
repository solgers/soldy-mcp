# Soldy — Best Practices

## Prompt Engineering

### Be Specific About What Matters, Open About the Rest

Soldy has a full creative team behind it — creative director, DP, production designer. Give it the constraints that matter to you and let it handle the creative execution.

**Effective prompt structure:**
```
What: [product/brand] + [content type]
Platform: [target platform + ratio]
Tone: [one or two words]
Key constraint: [the ONE thing that must be right]
```

**Example — Good:**
```
Create a 15-second product video for the Aero wireless earbuds.
Hero the noise-cancellation feature.
Target: TikTok (9:16).
Tone: sleek, premium.
```

**Example — Over-prescriptive (avoid):**
```
Create a video. Shot 1: close-up of earbuds on white background, 3 seconds,
fade in from black. Shot 2: person putting earbuds in, medium shot, 4 seconds.
Shot 3: show the noise cancellation icon with text overlay...
```

The second example constrains Soldy's creative direction so heavily that you lose the value of its production pipeline. If you need that level of control, you're directing — not delegating.

### Platform-Specific Tips

| Platform | What to Specify | What Soldy Handles |
|----------|----------------|-------------------|
| TikTok | Hook in first 2 seconds, 9:16, keep under 30s | Scroll-stopping opener, trend-aware pacing |
| YouTube | Can be longer (30-60s), 16:9 | Narrative arc, retention-optimized structure |
| Instagram Reels | 15-30s, 9:16, visual-first | Eye-catching transitions, music sync |
| Instagram Feed | 1:1, static or short video | Composition for square format |

### Prompt Templates by Production Type

**Product Video (PV):**
Focus on product features, materials, use cases. No characters needed.
```
[Duration]-second product video for [product].
Highlight: [feature].
Platform: [platform] ([ratio]).
Tone: [tone].
```

**Story / Narrative Ad:**
Focus on emotional setup. Let Soldy design characters and story arc.
```
[Duration]-second [comedic/emotional/cultural] ad for [product].
[One-sentence scenario or setup].
Platform: [platform] ([ratio]).
```

**Brand Video:**
Focus on brand values and positioning. Often longer format.
```
Brand manifesto video for [brand name].
Core message: [brand promise or value].
[Duration] seconds, [cinematic/documentary/energetic] style.
Platform: [platform] ([ratio]).
```

---

## Workflow Patterns

### Brand-First Pattern (Recommended)

Always extract brand identity before generating content. The brand provides color palette, tone, positioning — without it, Soldy generates in a vacuum.

```
1. extract_brand(product_url) → task_id
2. watch_brand_task(task_id) → wait → brand_id
3. create_project(name, brand_id)
4. send_message(project_id, content, ratio, brand_id=brand_id)
```

Skip only when the user explicitly has no brand/product URL and wants a generic creative.

### Multi-Variant Production

Generate multiple variants from one brand setup — different platforms, tones, or angles:

```
1. Extract brand once
2. Create project A: "TikTok product showcase" (9:16)
3. Create project B: "YouTube brand story" (16:9)
4. Create project C: "Instagram carousel" (1:1)
```

Each project reuses the same `brand_id`, so all outputs share consistent brand identity.

### Iteration Pattern

Iteration is cheaper than restarting. Soldy preserves project context — storyboards, color bible, character designs — across messages.

**When to iterate (same project):**
- Adjusting individual shots
- Changing music or audio
- Tweaking lighting, color, pacing
- Adapting to a different ratio
- Refining the script

**When to restart (new project):**
- Completely different creative direction
- Different product entirely
- Switching from PV to narrative (or vice versa)

### Monitoring Strategy

```
Preferred:  watch_project(project_id)  ← real-time, no polling
Fallback:   loop { get_project_status(project_id) } every 5-10s

Preferred:  watch_brand_task(task_id)   ← auto-stops on completion
Fallback:   loop { get_brand_task_result(task_id) } every 5s
```

Use the preferred approach unless your agent doesn't support MCP resource subscriptions.

---

## Common Anti-Patterns

### Creating New Projects to Iterate

**Wrong:** Create a new project every time you want a change.
**Right:** Send another `send_message` to the same project. Soldy refines without losing context.

### Putting Product URLs in Text Only

**Wrong:** `send_message(project_id, "Check out https://example.com/product and make a video")`
**Right:** `extract_brand("https://example.com/product")` → get `brand_id` → pass to `send_message`

Product URLs in text are NOT automatically processed for brand extraction.

### Polling When Subscriptions Are Available

**Wrong:** Tight polling loop with `get_project_status` every 2 seconds.
**Right:** `watch_project(project_id)` — you get notified on status changes, new messages, and new materials.

### Skipping `brand_id`

**Wrong:** `send_message(project_id, content, ratio)` when a brand exists.
**Right:** `send_message(project_id, content, ratio, brand_id=brand_id)` — always pass it.

Without `brand_id`, the generated content may not match the brand's color palette, tone, or positioning.

### Over-Prescriptive Prompts

**Wrong:** Specifying every shot, camera angle, and transition in your prompt.
**Right:** Describe the outcome you want (tone, key message, platform) and let Soldy's creative direction engine handle the cinematography.

Soldy's production value comes from its multi-phase creative process. Over-constraining it is like hiring a cinematographer and then telling them exactly where to point the camera.

---

## Performance Tips

1. **Extract brand once, reuse everywhere** — the `brand_id` is permanent. No need to re-extract for the same product.

2. **Batch materials in a single `send_message`** — pass all reference images/videos in one `material_urls` array rather than sending multiple messages.

3. **Choose the right iteration level** — shot-level tweaks (Level 1) are fast; creative-level restarts (Level 5) trigger the full pipeline again. See [workflows.md](workflows.md) for the iteration level table.

4. **Let generation complete before iterating** — wait for `completed` status before sending refinement messages. Interrupting mid-generation wastes credits and processing time.

5. **Use `pause_project` strategically** — if you need time to review intermediate results, pause instead of letting the agent continue. Resume with `continue_project` when ready.
