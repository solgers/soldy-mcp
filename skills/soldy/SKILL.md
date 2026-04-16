---
name: soldy
description: "Soldy AI is a conversational creative agent that turns product/brand context into broadcast-quality video ads, social images, product shots, and brand identities. It is a collaborator you talk with over multiple turns, not a one-shot job runner. Use this skill whenever the user wants to create, refine, or iterate on video ads, product videos, brand commercials, narrative/comedic/emotional ads, social ad creatives, product photography, or brand identities — and whenever they mention TikTok ads, YouTube ads, Instagram Reels, ad creatives, storyboards, shot lists, aspect ratios, brand extraction, or animating images. Also triggers on: Soldy, soldy.ai, @soldy_ai/mcp, create_project, chat, send_message, extract_brand, get_updates, get_project_materials, Seedance, Seedance 2.0, image-to-video, animate image, reference image video."
---

# Soldy AI

Soldy is a **conversational creative agent**. A Soldy *project* is a *conversation*, not a job ticket. You and the user talk to Soldy over multiple turns, just like you'd talk to a human creative director — they propose, you react, they refine. Brands are persistent memory the conversation can lean on. Iteration is the default mode, not an exception.

If you remember nothing else from this skill, remember this: **don't dump the user's first sentence into `chat` and walk away.** That's the equivalent of forwarding a one-line email to a creative agency and expecting a finished commercial back. It's not how Soldy is designed to be used and it's not how the user experiences Soldy on the web — they land on a chat surface and are *guided into* creation.

## The mental model

Think of Soldy as a creative director sitting on the other side of a chat window. Behind that chat there really is a full production team — director, DP, production designer, music director — but you don't talk to them directly. You talk to the director, and the director coordinates the team.

A few consequences of that model:

- **`chat` is a turn in a conversation, not "submit job".** Multiple `chat` calls per project is the *normal* case. The project accumulates context — brand, references, locked direction, prior shots — across every turn. `chat` sends your message and blocks until Soldy responds (completes, pauses, errors, or times out).
- **Soldy will pause and ask for things.** Sometimes credits. Sometimes a creative choice between A/B/C directions. Sometimes approval before moving from script to video. When the `chat` response status is `paused`, it is waiting for the **user**, not for you. Surface the question; don't invent an answer.
- **It takes minutes, not seconds.** A real production pipeline runs behind the scenes. The `chat` tool handles waiting automatically (default 5-minute timeout). Tell the user it's running if the wait is long.
- **Iterate in place.** If the user wants the music changed or shot 3 redone, send another message to the same project via `chat`. Never create a new project to "fix" something — you'd lose the brand, the look reference, the storyboard, and the character designs.

## What Soldy can do

This is a capability map, not a recipe. Pick what fits the conversation.

- **Brand memory** — extract a brand identity from a product URL (`extract_brand`), then reuse that `brand_id` across any number of projects so colors, tone, and positioning stay consistent. `extract_brand` blocks until done by default.
- **Generate** — video ads (TikTok / Reels / YouTube / square), product videos, narrative and story ads (comedic, emotional, cultural, conversion modes), social ad images, product photography, and music/soundtracks.
- **Iterate at any granularity** — re-do a single shot, swap the music, change the tone across all shots, adapt 16:9 -> 9:16 with smart recomposition (not just cropping), or rethink the creative direction entirely. Lower-granularity iterations are faster and preserve more of the prior work.
- **Direct fast-paths for users who already know what they want.** The most important one: **Seedance mode**. If the user has a reference image and just wants it animated into a short video, calling `chat` with `input_mode: "seedance"` and `seedance_reference_url` skips the entire creative-direction pipeline and drives Seedance 2.0 directly. This is the right call for "animate this image" requests; it would be wrong for "make me a TikTok ad."

## Reading the user — pick the depth that fits

The same skill should serve a user with a vague idea *and* a user who arrives with a fully-formed brief. The right interaction depth depends on signals from the user, not on a fixed checklist. Here's how to read those signals:

- **Vague intent** — "I want to make some kind of ad for my coffee shop." The user wants to be guided. Treat this like a kickoff meeting. Offer to extract their brand if they have a URL. Ask the questions a creative director would ask: target platform, length, tone, what the ad is supposed to *do* (awareness? conversion? brand?). When you do call `chat`, frame it as a starting prompt — and expect Soldy to come back with proposals or questions that you should bring back to the user before continuing.
- **Concrete brief** — "Make a 15s 9:16 comedic ad for product X, here's the brand_id, here's the photo." The user is ready. Don't drag them through clarifying questions they've already answered. One well-formed `chat` call. You can still surface Soldy's intermediate decisions, but you don't need to prompt for them.
- **Reference-driven** — "Animate this product photo into a short loop." Skip the full pipeline. This is what Seedance mode is for.
- **Mid-conversation refinement** — the user is reacting to something Soldy already produced. Iterate on the same project. Translate their feedback ("the ending feels flat") into an iteration message via `chat`; don't restart.

You have permission to *choose* the depth. The skill is intentionally not giving you a numbered procedure, because the right procedure depends on what the user actually said.

## What good looks like

When a Soldy result comes back, you can help the user evaluate it instead of just delivering it. Soldy itself scores every output across six dimensions — these are useful as a shared vocabulary for "is this any good?":

| Dimension | Weight | The question it answers |
|---|---|---|
| Scroll-stopping power | 25% | Would this stop a thumb mid-scroll? |
| Message clarity | 20% | Is one viewing enough to understand it? |
| Emotional resonance | 20% | Does the viewer *feel* something? |
| Brand fit | 15% | Is it unmistakably on-brand? |
| Conversion potential | 10% | Will it drive action? |
| Shareability | 10% | Would someone send this to a friend? |

Rough heuristic Soldy uses internally: 8.0+ ships, 6.5-7.9 polishes, below that revises. Use those as a starting point for your own judgment, not as a hard gate. If the user is happy and you're at 7.4, ship.

## What to do when...

These are judgment cards, not a workflow. Read them as "if you find yourself in this situation, here's how to think about it."

- **The `chat` response status is `paused`.** Soldy is waiting on the user, not on you. Read why (credits running out? a creative choice between proposed directions? an approval gate?), bring it to the user in plain language, and only call `continue_project` once they've actually answered.
- **The user gives feedback on a shot or the music.** Iterate via `chat` on the same project. The project remembers everything — brand, look reference, characters, prior shots. A new project would lose all of that and force Soldy to rebuild from scratch.
- **The `chat` response timed out.** Generation is still running. Use `get_updates(project_id, cursor)` with the cursor from the `chat` response to check for new results. Tell the user it's still working.
- **The user mentions a product URL but you don't have a brand yet.** Offer to `extract_brand` first. Soldy does **not** auto-extract URLs that appear inside message text — that step has to be explicit, and you'll get much better output if you do it.
- **The user says "use this image" or "animate this".** Reach for Seedance mode (`input_mode: "seedance"` + `seedance_reference_url`) instead of triggering the full creative pipeline. It's faster and matches their intent.
- **The user gave you a one-liner like "make me an ad".** Don't paste it into `chat`. Ask the questions a human director would ask first. The output from a one-liner will be generic and the user will be disappointed.
- **You're not sure whether to iterate or restart.** Default to iterate. Restart only when the creative direction itself is wrong (different product, wrong format type, fundamentally different concept). Tone, lighting, music, pacing, and individual shots are all iteration territory.

## Boundaries — what *not* to do

- Don't treat `chat` as a one-shot job. It's a conversation turn.
- Don't auto-resolve Soldy's pauses without consulting the user.
- Don't create a new project to "fix" something in an existing one.
- Don't skip `extract_brand` and hope Soldy will infer the brand from text in your message.
- Don't dump a vague user prompt straight into Soldy without first asking the questions a creative director would ask.
- Don't over-prescribe shot-by-shot direction in your prompt. If you find yourself writing "shot 1: close-up, 3 seconds, fade in", you're directing — you're not delegating, and you're throwing away the value of Soldy's production pipeline. Tell Soldy *what matters and why*; let it handle the cinematography.

## Tool quick reference

Full parameter docs: [references/tools.md](references/tools.md). One-line summaries grouped by purpose:

**Brand memory**
- `extract_brand(product_url)` — extract brand identity from a URL (blocks until done by default).
- `get_brand_task_result(task_id)` — check status when `extract_brand` was called with `wait=false`.
- `list_brands()` / `create_brand(...)` — find existing brands or create one manually.

**Project lifecycle**
- `create_project(name, brand_id?, ratio?)` — open a new conversation with Soldy.
- `list_projects()` / `get_project(project_id)` — find or inspect projects.

**Conversation**
- `chat(project_id, message, ratio, ...)` — **primary tool**. Sends a message and waits for the complete agent response. Returns status, messages, materials, and a cursor.
- `send_message(project_id, content, ratio, ...)` — fire-and-forget alternative (doesn't wait for response).
- `list_messages(project_id)` — read the full conversation history.

**Follow-up**
- `get_updates(project_id, cursor?)` — get new events since a cursor (after `chat` timeout or `send_message`).
- `get_project_status(project_id)` — quick status check.
- `get_project_materials(project_id)` — fetch the produced assets.

**Control**
- `pause_project` / `continue_project` / `stop_project` — pause for review, resume after a user decision, or stop entirely. Note: Soldy itself sometimes puts a project into `pause`; that's a *user* decision point, not a control you should auto-resolve.

## Aspect ratios

`ratio` is required in `chat` and `send_message`. Pick by target platform:

| Ratio | Where it fits |
|---|---|
| `9:16` | TikTok, Reels, Shorts (vertical mobile) |
| `16:9` | YouTube, landscape |
| `1:1` | Instagram / Facebook square feed |
| `4:3` / `3:4` / `3:2` / `2:3` / `21:9` | Presentations, portrait, photo, ultra-wide cinematic |

After producing one ratio, you can ask Soldy to adapt to others — it intelligently recomposes rather than cropping.

## Materials

Pass references via `material_urls` in `chat` or `send_message`. Local paths (`./product.jpg`) are auto-uploaded. HTTP and `gs://` URLs are passed through. Images, videos, and audio are all supported. Batch them in a single message rather than dribbling them in one at a time.

## Agent compatibility

| Client | Strategy |
|---|---|
| Claude Code / Desktop | `chat` handles everything — sends message + waits for response automatically. |
| Cursor | `chat` works. If timeout issues arise, use `send_message` + `get_updates`. |
| Codex / Gemini CLI | `chat` works (blocking). Or use `send_message` + poll `get_project_status`. |

## Prerequisites

The Soldy MCP server (`@soldy_ai/mcp`) must be installed and configured with a valid API key. If `create_project`, `chat`, etc. are not available in your session, install via the `soldy-mcp-setup` skill or directly:

```bash
npx skills add solgers/soldy-mcp@soldy-mcp-setup
```

## Deep-dive references

| Reference | When to read it |
|---|---|
| [references/tools.md](references/tools.md) | Full parameter reference for all MCP tools. |
| [references/resources.md](references/resources.md) | MCP resource URIs (read-only). |
| [references/workflows.md](references/workflows.md) | What Soldy does internally — useful when you need to *explain* Soldy to the user, not as a procedure to follow. |
| [references/best-practices.md](references/best-practices.md) | Judgment heuristics for prompts, iteration, and reading project state. |
| [references/troubleshooting.md](references/troubleshooting.md) | Error codes and common fixes. |
