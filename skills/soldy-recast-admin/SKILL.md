---

name: soldy-recast-admin
description: Connect Soldy Recast Admin and run Higgsfield feed intake, candidate review handoffs, budgeted evaluations, three-video reports and publication of a selected result.
---

# Recast Admin

Use the soldy-recast-admin MCP server. For setup, use the admin origin from Recast → Connect MCP and the personal key for the intended organization. Run the connector in a terminal so its hidden prompt can read the key. Choose the matching client.

```sh
npx -y --package @soldy_ai/mcp@0.8.2 soldy-recast-connect codex <ADMIN_API_ORIGIN>
npx -y --package @soldy_ai/mcp@0.8.2 soldy-recast-connect claude <ADMIN_API_ORIGIN>
```

Reopen the client and call list_candidates for approved candidates on page 1. An empty list confirms access. A 401 calls for checking the key and origin. A 403 calls for checking admin and organization membership.

## Run a batch

- For a scan only, pass the requested feed and thresholds to sync_showcases. For an end-to-end run, use list_evaluation_workspaces and establish the intended workspace and total credit limit. Include them in evaluation with a fresh UUID request_key. Reuse that UUID and identical arguments when retrying the same request. A previous batch's approval covers only that batch.
- Keep the returned run_id. Poll get_sync until each partition finishes, reaches its page cap or fails. Then use get_batch_progress to follow the imports until queued work settles. Page through the batch's candidates. Report scan skips, import failures and review-ready candidates separately.
- Hand off candidate decisions to the reviewer in Recast Admin. For a budgeted batch, the backend observes approvals and starts the evaluations. Use get_batch_progress to resume after a chat interruption and follow its evaluation IDs. Report a blocked budget or workspace to the operator. For a separately requested manual evaluation, use quote_evaluation, then start_evaluation with the approved max_credits and a stable request_key.
- Poll get_report until every slot has a terminal result. Summarize each slot's status, selected assets, share link or failure reason, and charged credits. A retry can incur another charge.
- Let the reviewer select the result. When they authorize publication, call publish_evaluation_result with the evaluation ID, selected task ID and intended catalog in the connected environment. Verify publication_status in get_report before reporting it published.
