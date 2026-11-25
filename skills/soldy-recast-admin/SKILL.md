---

name: soldy-recast-admin
description: Connect Soldy Recast Admin and run Higgsfield feed intake, candidate review handoffs, budgeted evaluations, evaluation reports, edited variants and publication of a selected result.
---

# Recast Admin

Use the soldy-recast-admin MCP server. For setup, use the admin origin from Recast → Connect MCP and the personal key for the intended organization. Run the connector in a terminal so its hidden prompt can read the key. Choose the matching client.

```sh
npx -y --package @soldy_ai/mcp@latest soldy-recast-connect codex <ADMIN_API_ORIGIN>
npx -y --package @soldy_ai/mcp@latest soldy-recast-connect claude <ADMIN_API_ORIGIN>
```

Reopen the client and call list_candidates for approved candidates on page 1. An empty list confirms access. A 401 calls for checking the key and origin. A 403 calls for checking admin and organization membership.

## Run a batch

- For a scan only, pass the requested feed and thresholds to sync_showcases. For an end-to-end run, use list_evaluation_workspaces and establish the intended workspace and total credit limit. Use one task per candidate by default. When the user specifies a count, pass evaluation.task_count (1–5). Include the workspace and credit limit in evaluation with a fresh UUID request_key. Reuse that UUID and identical arguments when retrying the same request. A previous batch's approval covers only that batch.
- Keep the returned run_id. Poll get_sync until each partition finishes, reaches its page cap or fails. Then use get_batch_progress to follow the imports until queued work settles. Page through the batch's candidates. Report scan skips, import failures and review-ready candidates separately.
- Hand off candidate decisions to the reviewer in Recast Admin. For a budgeted batch, the backend observes approvals and starts the evaluations. Use get_batch_progress to resume after a chat interruption and follow its evaluation IDs. Report a blocked budget or workspace to the operator. For a separately requested manual evaluation, use quote_evaluation, then pass the same task_count to start_evaluation with the approved max_credits and a stable request_key.
- Poll get_report until every slot has a terminal result. Summarize each slot's status, selected assets, share link or failure reason, and charged credits. A retry can incur another charge.
- Let the reviewer select the result. When they authorize publication, call publish_evaluation_result with the evaluation ID, selected task ID and intended catalog in the connected environment. Verify publication_status in get_report before reporting it published.

## Edit a completed result

- Use get_report to identify the candidate and successful task. Call get_evaluation_edit_draft to inspect the reference video, saved recipe, image limit, workspace and estimated credits for one variant.
- Use list_test_asset_categories and list_test_assets to find approved additions or replacements. Build the full ordered images list. Retain a draft image with original_index. Use catalog_id to add an image and include replaces_original_index to transfer a replaced image's prompt references. Draft indexes start at zero.
- Omit prompt to renumber the original references automatically. If an omitted image was referenced, adjust the prompt before submitting. In a supplied prompt, reference the final image order starting at one.
- Confirm the material changes and credit limit for this variant. Call start_edited_evaluation with that max_credits and a fresh UUID v4. Reuse the UUID and inputs for retries. Follow the new evaluation ID with get_report and share it alongside the original result.
