# Soldy MCP smoke test

Stdio integration test for the Soldy MCP server. Spawns the built server
(`dist/index.js`) as a subprocess, connects a real MCP `Client`, and exercises
every registered tool in a safe order.

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

## Opt-in flags

These are off by default because they cost credits or take minutes.

| Env var                 | Adds                                                                    |
| ----------------------- | ----------------------------------------------------------------------- |
| `TEST_SEND_MESSAGE=1`   | `send_message` + `get_updates` (cheap generation request)               |
| `TEST_CHAT=1`           | `chat` — blocks up to 5 min, spends credits                             |
| `TEST_EXTRACT_BRAND=1`  | `extract_brand` with `wait=true` (~60 s, spends credits)                |
| `TEST_UPLOAD_PATH=/abs` | `upload_material` test against the given local file                     |

## What always runs

Read-only & cheap endpoints:

- `list_tools`, `list_resources`
- `list_brands`, `list_projects`
- `create_project` → `get_project` → `get_project_status` → `list_messages` → `get_project_materials` → `stop_project`
- `extract_brand` with `wait=false` → `get_brand_task_result` (single poll, no wait)
- `readResource` on `soldy://brands`, `soldy://project/{id}/status|messages|materials`
- `pause_project` / `continue_project` on the idle project (server is expected to reject — test only asserts the server responds sanely)

## Cleanup

The test creates a throwaway project named `mcp-smoke-<timestamp>`. There is
no public delete endpoint, so the project remains. The test prints the
project ID on exit for manual cleanup (admin UI or backend tooling).

Brand extraction tasks expire on their own.

## Exit code

`0` if every non-skipped step passed, `1` otherwise.
