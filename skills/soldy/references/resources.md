# Soldy MCP — Resources

## Resource URI Table

All resources are readable (read-only). Data returned as JSON.

| URI | Description |
|-----|-------------|
| `soldy://brands` | All brands in workspace |
| `soldy://brand/{brand_id}` | Single brand detail |
| `soldy://brand/task/{task_id}` | Brand extraction task status (progress %, brand_id on completion) |
| `soldy://project/{project_id}/status` | Project status (id, name, status, ratio, brand_id) |
| `soldy://project/{project_id}/messages` | Full conversation history |
| `soldy://project/{project_id}/materials` | All generated assets |
| `soldy://project/{project_id}/runs/{run_id}/messages` | Messages for a specific agent run |
| `soldy://project/{project_id}/runs/{run_id}/materials` | Materials for a specific agent run |

## Usage

Resources are **read-only data accessors**. They provide the same data available through tools like `list_messages`, `get_project_materials`, etc., but through the MCP resource protocol.

For real-time interaction, use the `chat` tool (which sends a message and waits for the complete response) or `get_updates` (which returns events since a cursor). Do not poll resources in a loop.

## WebSocket Internals

The `chat` and `get_updates` tools use WebSocket connections internally:
- WebSocket connects lazily on first `chat` or `get_updates` call
- Auto-reconnects with exponential backoff (1s -> 30s max)
- Reuses `client_id` within the same MCP session for session continuity
- Events are buffered per-project and consumed by tool calls
