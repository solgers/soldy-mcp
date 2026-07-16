# Soldy MCP smoke test

Stdio integration test for the Soldy MCP server. Spawns the built server
(`dist/index.js`) as a subprocess, connects a real MCP `Client`, and exercises
every registered tool in a safe order.

The server exposes two one-shot paths only — **Quick Create** (`video_*` /
`image_*`) and **Marketing Studio** (`seedance_*`). There are no projects,
brands, materials, or a conversational agent.

## Setup

```bash
cd services/mcp
bun install
```

## Run

```bash
SOLDY_API_URL=https://staging-api.soldy.ai \
SOLDY_API_KEY=<your-key> \
  bun run test:smoke
```

The `test:smoke` script runs `tsc` (to emit `dist/`) and then `tsx tests/smoke.ts`.

## What always runs

Read-only & cheap endpoints:

- `list_tools`
- Quick Create: `video_list_models`, `image_list_models` (registry drift check),
  `video_list_tasks`, `image_list_tasks`
- Marketing Studio: `list_seedance_history`, `list_video_ad_templates`
  (template drift check)

## What is skipped

The `_generate` tools spend credits and take minutes, so they are skipped by
default. Run them manually with the argument shapes printed in the skip notes:

- `video_generate`, `image_generate`
- `seedance_generate`

## Exit code

`0` if every non-skipped step passed, `1` otherwise.
