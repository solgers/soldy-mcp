# Soldy MCP — Resources & Subscriptions

## Resource URI Table

All resources are readable and subscribable. Data returned as JSON.

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

## Subscription Patterns

### Tool-Based (Recommended)

Use `watch_project` and `watch_brand_task` — they manage WebSocket connections automatically.

**Video generation monitoring:**
```
send_message(project_id, content, ratio)
watch_project(project_id)
→ notification: soldy://project/{id}/status
→ read resource → check status
→ "completed" → read soldy://project/{id}/materials
```

**Brand extraction monitoring:**
```
extract_brand(url) → task_id
watch_brand_task(task_id)
→ notification: soldy://brand/task/{task_id}
→ read resource → get brand_id
→ use brand_id in create_project / send_message
```

### Protocol-Based (Alternative)

MCP clients supporting `resources/subscribe` can subscribe directly:
```
subscribe("soldy://project/{project_id}/status")
subscribe("soldy://project/{project_id}/materials")
```

## Polling Fallback

For clients without MCP subscription support:

| Instead of subscribing to... | Poll this tool | Interval |
|-----|------|------|
| `soldy://project/{id}/status` | `get_project_status(project_id)` | 5-10s |
| `soldy://brand/task/{task_id}` | `get_brand_task_result(task_id)` | 5s |
| `soldy://project/{id}/messages` | `list_messages(project_id)` | on demand |
| `soldy://project/{id}/materials` | `get_project_materials(project_id)` | on demand |

## WebSocket Internals

The subscription bridge:
- Maintains persistent WebSocket to the Soldy API
- Auto-reconnects with exponential backoff (1s → 30s max)
- Re-subscribes all active projects on reconnect
- Brand task polling runs at 3s intervals, auto-stops on completion/failure

**Status events tracked:** RunStarted, RunCompleted, RunError, RunPaused, RunCancelled, RunContinued

**Message events tracked:** RunContent, RunContentCompleted, ToolCallStarted, ToolCallCompleted, ReasoningStep

**Material events:** Triggered when messages contain generated assets
