# What Soldy Does Behind `send_message`

This document describes what happens *inside* Soldy when you have a conversation with it. **It is not a procedure for you to follow.** Your interaction with Soldy is the conversation; the production pipeline below is Soldy's internal job. Read this when you need to *explain* Soldy to the user, anticipate where it might pause for input, or understand why a particular kind of refinement is fast vs. slow.

## The pipeline, in one picture

```
User turn (send_message)
  → Intent recognition (what kind of content?)
  → Domain routing (which production track?)
  → Creative direction (one locked strategic concept)
  → Visual foundation (reference images, color bible)
  → Script & storyboard (per-shot cinematography)
  → Media generation (video / image / audio)
  → Quality gate (6-dimension scoring)
  → Delivery
```

Each phase has checkpoints where Soldy may pause and ask the user for an approval or a creative choice. When that happens, the project status flips to `pause` and your job is to surface the question, not to invent an answer.

## Production tracks

These are the trajectories Soldy can take. Which one runs depends on what the user wants — Soldy picks based on the conversation, not based on you specifying it.

### Product video (PV)

Best for: e-commerce launches, product hero videos, demonstrations. Product-centric, no characters by default, typically 15–30s.

Internal phases: 4-role creative diagnosis → product four-view + color bible → shot table → storyboard → multi-route I2V/T2V via Kling v2.6 Pro → beat-driven music → merge.

### Narrative / story video

Best for: emotional, comedic, cultural, and conversion ads. Character-driven, dialogue or visual story.

Soldy auto-classifies the narrative intent into one of four modes and adapts the tension architecture, escalation curve, and cast intensity accordingly:

| Intent | Tension axis | Escalation | Cast intensity |
|---|---|---|---|
| Emotional | Identity / belonging | Linear, double reversal | DEPTH (psychology-driven) |
| Comedic | Status / imminent failure | Chaos escalation | MAXIMUM (10x hyperbole) |
| Cultural | Belonging / identity | Compressed reveal | MAXIMUM (zeitgeist-responsive) |
| Conversion | Time pressure / failure | Linear | SELECTIVE (relatable) |

In narrative mode, Soldy will often propose A/B/C creative directions and pause for the user to pick one. That pause is where you bring proposals back to the user — don't auto-pick.

### Social ad images

Static creatives for Instagram, Facebook, TikTok. Pipeline: references → composition → copy → render → quality gate.

### Product shots

E-commerce product photography and lifestyle staging.

### Seedance fast-path

When you call `send_message` with `input_mode: "seedance"` and a `seedance_reference_url`, Soldy bypasses creative direction entirely and drives Seedance 2.0 directly from the reference image. Use this for "animate this image" intents, not for "make me an ad".

## What "creative direction" produces

When the full pipeline runs, the creative direction phase locks one strategic concept that downstream phases all key off. It includes:

- **Video thesis** — what the video says through images
- **Product role** — reveal object, ritual center, texture icon, tool, etc.
- **Environment strategy** — where the product lives and why
- **Rhythm shape** — the progression logic
- **Killer shot** — one image that crystallizes the concept

This is locked once per creative direction. When the user asks for tone or shot tweaks, those iterations happen *under* the locked direction. When the user wants something fundamentally different, the direction itself is rewritten — that's a heavier iteration.

## Cast design (when characters are involved)

Soldy uses a contrast principle: memorability comes from the gap between expectation and reality. Entity types include humans, animals, robots, mascots, and product-as-character. Intensity scales from MAXIMUM (comedic / cultural) through DEPTH (emotional) to SELECTIVE (conversion) and NONE (product only).

## DP selection

Soldy picks a cinematographic style matched to the locked direction — Doyle, Lubezki, Hoytema, Fraser, Toland, Storaro, Muller, Urusevsky, Yusov, etc. Each DP shapes lens, framing, lighting, and composition rules. You don't pick the DP; the user describes the feel they want and Soldy chooses.

## Quality gate

Every produced asset is scored across six dimensions (see the SKILL.md "What good looks like" section for the table and weights). Score 8.0+ ships, 6.5–7.9 polishes, below that revises. These are Soldy's internal heuristics — useful as a shared vocabulary for talking with the user about whether an output is good, but not a hard gate.

## Iteration levels — fast vs. slow refinements

When the user gives feedback, the level of iteration determines how much of the prior work is preserved. Lower numbers are faster.

| Level | Scope | Example |
|---|---|---|
| 1 | Shot-level | "Redo shot 3 with warmer lighting" |
| 2 | Sequence-level | "Rework the opening sequence" |
| 3 | Element-level | "Change lighting across all shots" |
| 4 | Script-level | "Rewrite the script and regenerate" |
| 5 | Creative-level | "New creative direction entirely" |

Default to the lowest level that captures the user's intent. You don't need to specify the level explicitly — describe the change in plain language and Soldy picks the smallest scope it can.

## Format adaptation

Soldy can recompose a creative across aspect ratios *intelligently*, not by cropping: 16:9 → 9:16 reframes and vertically restages; 16:9 → 1:1 centers the composition and extends the background. This is much cheaper than regenerating.

## Models in use (for reference)

- **Image** — Google Gemini 2.0 (photorealistic T2I and I2I edits)
- **Video** — Kling v2.6 Pro (default), Seedance 2.0 (opt-in, multi-segment / edit / replace), LTX-2 (scene extension)
- **Audio** — AI music composition, Chatterbox TTS/STS, Whisper STT
- **Post** — Topaz upscaling, BRIA background removal, DreamActor v2 character animation, video merge / transitions
