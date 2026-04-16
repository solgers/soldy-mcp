# Soldy — Judgment Heuristics

The main SKILL.md gives you the mental model. This document is the deeper-cut version: a set of heuristics for the recurring judgment calls you'll make while having a conversation with Soldy on behalf of a user. None of this is a script. It's all "here's how to think about it."

## Reading the user's readiness

The single most important judgment call is: how prepared is the user, and how much should I push back vs. just execute? Some signals to read:

**Signals the user wants to be guided:**
- Vague intent ("make me an ad", "something cool for my brand", "help me with marketing video").
- No mention of platform, length, tone, or audience.
- They're describing their business, not their creative.
- They ask "what should I do?" instead of "do this."
- They give you a product URL but no brand_id and no images.

When you see these, slow down. Treat the first message as a kickoff conversation, not a brief. Offer to extract their brand if they have a URL. Ask one or two of the questions a creative director would ask — what platform, what feeling, what's the ad supposed to *do* — and bring those back to the user before you call `chat`. Your goal at this stage is to help the user discover what they actually want, not to start cranking out video.

**Signals the user is ready to fast-path:**
- Concrete length, ratio, tone, and platform stated up front.
- A `brand_id` or a clear brand context.
- Reference images attached or linked.
- They've used Soldy before and know the vocabulary.

When you see these, don't drag them through clarifying questions. Compose one well-formed `chat` call and surface intermediate decisions only when Soldy itself pauses for input.

**Signals it's a Seedance fast-path:**
- "Animate this image."
- "Turn this photo into a short loop."
- "Make a 5-second video from this reference."

Skip the creative pipeline entirely with `input_mode: "seedance"` and `seedance_reference_url`.

## Phrasing a message so Soldy treats it as a turn

A good message reads like something you'd say to a creative director, not like a JIRA ticket. State *what matters and why*, leave the *how* to Soldy.

A useful structure when you're starting a project from a brief:

```
What:     [product / brand] + [content type]
Platform: [target + ratio]
Tone:     [one or two words]
Anchor:   [the ONE thing that must be right]
```

**Good:**

```
Create a 15-second product video for the Aero wireless earbuds.
Hero the noise-cancellation feature.
Target: TikTok (9:16). Tone: sleek, premium.
```

**Over-prescriptive (avoid):**

```
Create a video. Shot 1: close-up of earbuds on white background, 3 seconds,
fade in from black. Shot 2: person putting earbuds in, medium shot, 4 seconds.
Shot 3: noise cancellation icon with text overlay...
```

The second one isn't using Soldy — it's bypassing the production pipeline that makes Soldy worth calling in the first place. If you find yourself writing shot lists in the prompt, stop and ask: *am I directing, or am I delegating?* If the user genuinely wants that level of micro-control, that's fine — but it should be a deliberate choice, not the default.

When you're iterating, the body looks different. Plain language is best:

```
Redo shot 3 with warmer lighting.
Make the music more upbeat.
Adapt this to 9:16 for TikTok.
```

You don't need to specify the iteration level. Describe the change in natural language and Soldy will pick the smallest scope that captures it.

## Reading project state

The `chat` response tells you what happened directly through its `status` field. If using `send_message` + `get_updates`, or `get_project_status`, map status to action:

| Status | What it means | What to do |
|---|---|---|
| `running` | Soldy is working. | Keep watching. Tell the user it's still going. |
| `pause` | Soldy is waiting on the *user* (credits, an A/B/C creative pick, an approval gate). | Read the reason, surface it to the user in plain language, and only call `continue_project` after they answer. |
| `error` | Something went wrong. | Read the error. Most errors are recoverable with a refined `chat` call. |
| `completed` | Assets are ready. | `get_project_materials` and show the user. |

The `pause` case is the most commonly mishandled. It is **not** a "press any key to continue" prompt. It's a real decision point that the user — not you — should make.

## Iteration vs. restart

Default to iteration. The project carries the brand, the look reference, the character designs, the storyboards, and all the prior shots. Throwing that away is expensive in both credits and quality.

**Iterate (same project) when:**
- Adjusting individual shots
- Changing music or audio
- Tweaking lighting, color, pacing
- Adapting to a different ratio
- Refining the script

**Restart (new project) only when:**
- The creative direction is fundamentally wrong
- It's a different product
- You're switching production type (e.g. PV -> narrative)

A useful test: if the user says "no, I meant...", iterate. If the user says "actually, forget that, what if we did...", consider whether restart is genuinely needed or whether it's still a creative-level (Level 5) iteration on the same project.

## Knowing when to converge vs. branch

After a few rounds of iteration, you'll notice one of two patterns:

**Converging** — each round addresses a smaller, more specific issue. Music, then a shot, then the ending beat. Keep going. This is the productive case.

**Diverging** — each round contradicts the previous one. The user asks for warmer lighting, then cooler, then warmer again. This usually means the creative direction itself isn't working and the user is searching for something the current direction can't deliver. When you spot this, surface it to the user explicitly: "we've been going back and forth on lighting — do you want to try a different creative direction?" That's a Level 5 iteration.

## Surfacing Soldy's questions to the user

When Soldy proposes A/B/C creative directions and pauses, your job is to translate Soldy's proposals into language the user can actually decide on. Don't just paste the raw output. Pull out the *concept* of each option in one sentence:

> Soldy proposed three directions:
> - **A**: Premium and minimal — single hero shot, slow reveal.
> - **B**: Energetic and social — fast cuts, faces, movement.
> - **C**: Story-led — a 10-second mini-narrative around the product.
> Which feels closest to what you want?

Then, once they pick, send a `chat` message saying which one to lock and resume. Don't auto-pick to "save the user a step" — the picks are why they're using Soldy.

## Performance heuristics

- **Extract brand once, reuse forever.** A `brand_id` is permanent across projects. Don't re-extract.
- **Batch materials.** Pass all reference images/videos in one `material_urls` array, not in a series of messages.
- **Let generation finish.** Don't interrupt mid-generation to refine — the work in flight is wasted.
- **Pause if the user wants time to review.** `pause_project` is fine when *you* (or the user) want to stop, distinct from Soldy's own pause-for-input. Resume with `continue_project`.
- **Use `chat` over `send_message`.** `chat` handles the waiting automatically. Use `send_message` + `get_updates` only when you need async control.

## Common anti-patterns

- **Pasting the user's first sentence into `chat`.** Almost always wrong for vague intents. Ask first.
- **Creating a new project to make a change.** Loses everything. Iterate in place.
- **Auto-resolving `pause` status.** Soldy is waiting on the user. Don't decide for them.
- **Putting product URLs in message text and hoping.** They are not auto-extracted. Use `extract_brand` explicitly.
- **Forgetting `brand_id`.** When a brand exists, always pass it — otherwise the output won't match the brand.
- **Using `send_message` when `chat` would work.** `chat` is simpler — it sends and waits in one call.
- **Writing shot-by-shot prompts.** You're directing instead of delegating. Describe outcomes; let Soldy handle cinematography.
