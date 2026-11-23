---
name: soldy-recast-admin
description: Connect Codex or Claude Code to the Soldy Recast management console and verify its internal MCP tools. Use for Recast admin MCP setup, personal API key configuration, internal showcase candidates and evaluation reports.
---

# Connect to Recast admin

Use the server name `soldy-recast-admin`. The general Soldy server and the public Recast server use separate entries and tool sets.

1. Identify the current agent client. If its Recast admin tools are already available, verify them as described below. For a new connection use the admin API origin from the user's **Recast → Connect MCP** page. Ask for that origin if missing. Use HTTPS for remote environments; a loopback origin connects to the user's local backend.
2. Use the personal key created in that page for the intended billing organization. Keep the key out of chat, command history and project files. If the current process already has `SOLDY_API_KEY` set, run the appropriate command below with the actual origin. Otherwise present the command for the user to run in their terminal; the installer prompts privately for the key.
3. For Codex run:

   ```sh
   npx -y --package @soldy_ai/mcp@0.8.1 soldy-recast-connect codex <ADMIN_API_ORIGIN>
   ```

   For Claude Code run:

   ```sh
   npx -y --package @soldy_ai/mcp@0.8.1 soldy-recast-connect claude <ADMIN_API_ORIGIN>
   ```

   Replace the angle-bracket placeholder before running either command. The installer registers the internal stdio binary with the selected client. For a client without that CLI, use the client's **Manual Config** snippet from the same admin page.
4. Reopen the agent session so it loads the new MCP entry. Call `list_candidates` with `{"status":"approved","page":1}`. A successful empty list also confirms the connection. This check does not create a generation task.
5. For a 401, check the environment and whether the personal key has been revoked. For a 403, check the active admin account and organization membership. If the tools report that automation is disabled, the environment's Statsig gate must be enabled to use them.
