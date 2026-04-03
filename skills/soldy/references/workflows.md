# Soldy — Production Pipelines & Workflows

## Production Pipeline Overview

When you call `send_message`, the Soldy agent runs through structured production phases. The exact pipeline depends on the content type, but all follow this general pattern:

```
User Prompt
  → Intent Recognition (what type of content?)
  → Domain Routing (which workflow?)
  → Creative Direction (strategic concept)
  → Visual Foundation (reference images, color bible)
  → Script & Storyboard (per-shot cinematography)
  → Media Generation (video/image/audio)
  → Quality Gate (6-dimension evaluation)
  → Final Delivery
```

Each phase has checkpoints where the agent may pause for approval.

---

## Video Production Workflows

### Product Video (PV)

Best for: e-commerce launches, brand hero videos, product demonstrations.

**Pipeline:**
1. **Creative Direction** — 4-role diagnosis (PM, Visual Artist, Creative Director, Director) → locked direction with video thesis, product role, environment strategy
2. **Reference Images** — Product four-view (multi-angle standardized sheet) + Color bible (mood board + HEX palette)
3. **Script Lock** — Full shot table with per-shot cinematography (scale, angle, lens, focus, composition, movement, lighting, sound)
4. **Storyboard** — Generated frame per shot using references as anchors
5. **Shot List** — I2V/T2V execution instructions per shot
6. **Video Generation** — Multi-route concurrent synthesis via Kling v2.6 Pro
7. **Music** — AI-composed soundtrack (beat-driven: unified tone, steady rhythm)
8. **Final Merge** — All clips + music assembled in shot order

**Characteristics:** Product-centric, no characters by default, typically 15-30s.

### Narrative / Story Video

Best for: emotional ads, comedic content, viral campaigns, character-driven narratives.

**Pipeline:**
1. **Narrative Intent Detection** — Auto-classify as Emotional, Comedic, Cultural, or Conversion
2. **Three Creative Directions** — Agent generates A/B/C options, user picks one
3. **Story Creative Card** — 8 narrative dimensions + constraint audit
4. **Full Prose Story** — Director psychological cinema style (no timecodes, parenthetical camera/sound notes)
5. **Cast Design** — Memorable characters via contrast principle
6. **Reference Images** — Character design + face/body views + color bible
7. **Script Lock** — Timing-locked beat table + per-shot cinematography
8. **Storyboard → Video → Music → Final Merge** (same as PV)

**Narrative Intent Details:**

| Intent | Tension Axis | Escalation | Cast Intensity |
|--------|-------------|------------|---------------|
| Emotional | Identity conflict, belonging crisis | Linear, double reversal | DEPTH (psychology-driven) |
| Comedic | Status risk, imminent failure | Chaos escalation | MAXIMUM (10x hyperbole) |
| Cultural | Belonging crisis, identity conflict | Compressed reveal | MAXIMUM (zeitgeist-responsive) |
| Conversion | Time pressure, imminent failure | Linear | SELECTIVE (relatable) |

### Social Ad Images

Best for: Instagram, Facebook, TikTok static creatives.

**Pipeline:**
1. Reference Images → Composition → Copy Generation → Image Render → Quality Gate

### Product Shots

Best for: e-commerce product photography, lifestyle imagery.

---

## Creative Production Engines

### Creative Direction Engine

Diagnoses the product and locks ONE production direction.

**Process:**
1. Product Diagnosis — four creative roles analyze the brief
2. Strategic Synthesis — core strategy axis, hero communication task, visual priority
3. Direction Development — locked direction with:
   - **Video Thesis**: what this video says through images
   - **Product Role**: reveal object, ritual center, texture icon, tool, etc.
   - **Environment Strategy**: where the product lives and why
   - **Rhythm Shape**: progression logic
   - **Killer Shot**: one image that crystallizes the concept

### Cast Design Engine

Creates memorable characters using the contrast principle (gap between expectation and reality = memorability).

**Entity Types:** Humans, Animals, Robots, Mascots, Product-as-Character

**Intensity Levels:**
- **MAXIMUM** (Comedic/Cultural) — 10x hyperbole, appearance IS the hook
- **DEPTH** (Emotional) — psychology-driven internal contradictions
- **SELECTIVE** (Conversion) — relatable "that's me" identification
- **NONE** — product only, no characters

### DP (Director of Photography) Selection

The agent selects a cinematographic style matched to the creative direction:
- Doyle (vibrant, kinetic), Lubezki (natural light, long takes), Hoytema (anamorphic, epic scale)
- Fraser (neon, high-contrast), Toland (deep focus, dramatic), Storaro (color symbolism)
- Muller (minimalist, austere), Urusevsky (fluid camera), Yusov (landscape, patience)

Each DP governs: lens choices, framing, lighting approach, composition rules.

---

## Quality Gate: 6-Dimension Evaluation

Every produced asset is scored across six dimensions:

| Dimension | Weight | Question |
|-----------|--------|----------|
| Scroll-Stopping Power | 25% | Would this stop a thumb mid-scroll? |
| Message Clarity | 20% | Single viewing = complete understanding? |
| Emotional Resonance | 20% | Does the viewer FEEL something? |
| Brand Fit | 15% | Unmistakably on-brand? |
| Conversion Potential | 10% | Will this drive action? |
| Shareability | 10% | Would someone share with a friend? |

**Quality verdicts:**

| Score | Verdict | Action |
|-------|---------|--------|
| 8.0+ | Exceptional | Ship |
| 6.5-7.9 | Good | Minor polish |
| 5.0-6.4 | Needs Work | Revise |
| < 5.0 | Restart | Rethink at creative phase |

---

## Iteration Levels

When refining content, Soldy applies targeted iteration — surgical improvements without full restart:

| Level | Scope | Example |
|-------|-------|---------|
| 1 | Shot-level | "Redo shot 3 with warmer lighting" |
| 2 | Sequence-level | "Rework the opening sequence" |
| 3 | Element-level | "Change lighting across all shots" |
| 4 | Script-level | "Rewrite script and regenerate" |
| 5 | Creative-level | "New creative direction entirely" |

Lower levels are faster and preserve more of the existing work.

---

## Format Adaptation

Soldy can recompose a single creative across aspect ratios intelligently (not just cropping):

- 16:9 → 9:16: reframing, vertical restaging
- 16:9 → 1:1: center composition, background extension
- Any → Any: smart recomposition with platform-specific adjustments

---

## AI Models Used

### Image Generation
- **Google Gemini 2.0** — photorealistic text-to-image and image-to-image editing

### Video Generation
- **Kling v2.6 Pro** (default) — reliable I2V/T2V, 5-10s clips
- **Seedance 2.0** (opt-in) — advanced multi-segment, edit/replace modes, 4-15s
- **LTX-2** (alternative) — scene extension

### Audio
- **Music generation** — AI composition with full instrumentation control
- **Chatterbox TTS/STS** — voice generation and cloning
- **Whisper STT** — audio transcription

### Post-Processing
- **Topaz** — image/video upscaling (4K, 8K)
- **BRIA** — video background removal
- **DreamActor v2** — character animation/reenactment
- **Video merge/transitions** — assembly and polish
