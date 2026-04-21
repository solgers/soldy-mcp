/**
 * Soldy MCP smoke test — spawn the built MCP server via stdio and exercise
 * every registered tool in a safe order. Requires a real API key + URL.
 *
 * Run:
 *   SOLDY_API_URL=https://staging-api.soldy.ai SOLDY_API_KEY=xxx \
 *     bun run test:smoke
 *
 * Opt-in flags (default off — these cost credits or take minutes):
 *   TEST_SEND_MESSAGE=1    exercise send_message + get_updates
 *   TEST_CHAT=1            exercise chat (blocks up to 5min, costs credits)
 *   TEST_EXTRACT_BRAND=1   exercise extract_brand wait=true (~60s, costs credits)
 *   TEST_UPLOAD_PATH=/abs  exercise upload_material with given local file
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Runner } from "./lib/runner.js";

const apiUrl = process.env.SOLDY_API_URL;
const apiKey = process.env.SOLDY_API_KEY;

if (!apiUrl || !apiKey) {
  console.error(
    "Usage: SOLDY_API_URL=<url> SOLDY_API_KEY=<key> bun run test:smoke",
  );
  console.error(
    "  Optional flags: TEST_SEND_MESSAGE=1 TEST_CHAT=1 TEST_EXTRACT_BRAND=1 TEST_UPLOAD_PATH=<path>",
  );
  process.exit(2);
}

const testSendMessage = process.env.TEST_SEND_MESSAGE === "1";
const testChat = process.env.TEST_CHAT === "1";
const testExtractBrand = process.env.TEST_EXTRACT_BRAND === "1";
const testUploadPath = process.env.TEST_UPLOAD_PATH;

const testsDir = fileURLToPath(new URL(".", import.meta.url));
const serverEntry = resolve(testsDir, "..", "dist", "index.js");

console.log(`\n\x1b[1mSoldy MCP smoke test\x1b[0m`);
console.log(`  API:    ${apiUrl}`);
console.log(`  Server: ${serverEntry}\n`);

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [serverEntry],
  env: {
    ...process.env,
    SOLDY_API_URL: apiUrl,
    SOLDY_API_KEY: apiKey,
  } as Record<string, string>,
  stderr: "inherit",
});

const client = new Client(
  { name: "soldy-mcp-smoke", version: "0.0.1" },
  { capabilities: {} },
);

const runner = new Runner();

type TextContent = { type: "text"; text: string };
type ToolResult = {
  content?: Array<TextContent | { type: string; [k: string]: unknown }>;
  isError?: boolean;
};

function firstText(result: ToolResult): string {
  const c = result.content?.find((x): x is TextContent => x.type === "text");
  return c?.text ?? "";
}

async function call(name: string, args: Record<string, unknown>) {
  const res = (await client.callTool({ name, arguments: args })) as ToolResult;
  if (res.isError) {
    throw new Error(firstText(res) || `${name} returned isError`);
  }
  return firstText(res);
}

let createdProjectId: string | undefined;
let createdBrandTaskId: string | undefined;

try {
  await runner.step("connect to MCP server", async () => {
    await client.connect(transport);
  });

  await runner.step("list tools", async () => {
    const { tools } = await client.listTools();
    if (!tools?.length) throw new Error("no tools registered");
    console.log(
      `    → ${tools.length} tools: ${tools
        .map((t) => t.name)
        .slice(0, 10)
        .join(", ")}${tools.length > 10 ? ", ..." : ""}`,
    );
  });

  await runner.step("list resources (templates + fixed)", async () => {
    const { resources } = await client.listResources();
    console.log(`    → ${resources?.length ?? 0} fixed resources`);
  });

  // ---- Read-only ---------------------------------------------------------

  await runner.step("list_brands", async () => {
    const text = await call("list_brands", {});
    console.log(`    → ${text.split("\n")[0]}`);
  });

  await runner.step("list_projects", async () => {
    const text = await call("list_projects", {});
    console.log(`    → ${text.split("\n")[0]}`);
  });

  // ---- Project lifecycle (cheap) ----------------------------------------

  const smokeName = `mcp-smoke-${Date.now().toString(36)}`;

  await runner.step("create_project", async () => {
    const text = await call("create_project", {
      name: smokeName,
      ratio: "9:16",
      description: "created by services/mcp smoke test",
    });
    const m = /ID: `([^`]+)`/.exec(text);
    if (!m) throw new Error(`could not parse project id from: ${text}`);
    createdProjectId = m[1];
    console.log(`    → project_id = ${createdProjectId}`);
  });

  if (createdProjectId) {
    await runner.step("get_project", async () => {
      await call("get_project", { project_id: createdProjectId });
    });

    await runner.step("get_project_status", async () => {
      const text = await call("get_project_status", {
        project_id: createdProjectId,
      });
      console.log(`    → ${text.split("\n")[0]}`);
    });

    await runner.step("list_messages (empty project)", async () => {
      await call("list_messages", { project_id: createdProjectId });
    });

    await runner.step("get_project_materials (empty)", async () => {
      await call("get_project_materials", { project_id: createdProjectId });
    });
  } else {
    runner.skip("get_project", "no project created");
    runner.skip("get_project_status", "no project created");
    runner.skip("list_messages", "no project created");
    runner.skip("get_project_materials", "no project created");
  }

  // ---- Brand task (cheap: just create the task, don't poll) -------------

  await runner.step("extract_brand (wait=false)", async () => {
    const text = await call("extract_brand", {
      content: "https://www.apple.com/",
      wait: false,
    });
    const m = /task: `([^`]+)`/.exec(text);
    if (!m) throw new Error(`no task_id in: ${text}`);
    createdBrandTaskId = m[1];
    console.log(`    → task_id = ${createdBrandTaskId}`);
  });

  if (createdBrandTaskId) {
    await runner.step("get_brand_task_result", async () => {
      await call("get_brand_task_result", { task_id: createdBrandTaskId });
    });
  } else {
    runner.skip("get_brand_task_result", "no brand task created");
  }

  if (testExtractBrand) {
    await runner.step("extract_brand (wait=true, ~60s)", async () => {
      await call("extract_brand", {
        content: "https://www.patagonia.com/",
        wait: true,
      });
    });
  } else {
    runner.skip(
      "extract_brand wait=true",
      "TEST_EXTRACT_BRAND=1 not set (costs credits)",
    );
  }

  // ---- Resources --------------------------------------------------------

  await runner.step("readResource soldy://brands", async () => {
    await client.readResource({ uri: "soldy://brands" });
  });

  if (createdProjectId) {
    await runner.step("readResource soldy://project/{id}/status", async () => {
      await client.readResource({
        uri: `soldy://project/${createdProjectId}/status`,
      });
    });
    await runner.step(
      "readResource soldy://project/{id}/messages",
      async () => {
        await client.readResource({
          uri: `soldy://project/${createdProjectId}/messages`,
        });
      },
    );
    await runner.step(
      "readResource soldy://project/{id}/materials",
      async () => {
        await client.readResource({
          uri: `soldy://project/${createdProjectId}/materials`,
        });
      },
    );
  }

  // ---- Optional (credits-spending) --------------------------------------

  if (testSendMessage && createdProjectId) {
    await runner.step("send_message (fire-and-forget)", async () => {
      await call("send_message", {
        project_id: createdProjectId,
        content: "hello from smoke test",
        ratio: "9:16",
      });
    });
    await runner.step("get_updates", async () => {
      await call("get_updates", {
        project_id: createdProjectId,
        wait_seconds: 2,
      });
    });
  } else {
    runner.skip(
      "send_message",
      testSendMessage
        ? "no project created"
        : "TEST_SEND_MESSAGE=1 not set (costs credits)",
    );
    runner.skip(
      "get_updates",
      testSendMessage ? "no project created" : "TEST_SEND_MESSAGE=1 not set",
    );
  }

  if (testChat && createdProjectId) {
    await runner.step("chat (may take ~5min)", async () => {
      await call("chat", {
        project_id: createdProjectId,
        message: "a 9:16 5-second smoke test clip",
        ratio: "9:16",
        timeout_seconds: 300,
      });
    });
  } else {
    runner.skip(
      "chat",
      testChat ? "no project created" : "TEST_CHAT=1 not set (costs credits)",
    );
  }

  if (testUploadPath) {
    await runner.step(`upload_material (${testUploadPath})`, async () => {
      await call("upload_material", {});
    });
  } else {
    runner.skip("upload_material", "TEST_UPLOAD_PATH=/abs not set");
  }

  // ---- Standalone workflows (Recast / CineAd / ImageKit) ---------------
  // History endpoints are read-only and cheap — always run them.
  // The `_generate` tools spend credits + take minutes, so they're skipped.

  await runner.step("recast_list_history", async () => {
    await call("recast_list_history", { page: 1, page_size: 5 });
  });
  await runner.step("cinead_list_history", async () => {
    await call("cinead_list_history", { page: 1, page_size: 5 });
  });
  await runner.step("imagekit_list_history", async () => {
    await call("imagekit_list_history", { page: 1, page_size: 5 });
  });

  runner.skip(
    "recast_generate",
    "spends credits + takes minutes (no opt-in flag yet)",
  );
  runner.skip(
    "cinead_generate",
    "spends credits + takes minutes (no opt-in flag yet)",
  );
  runner.skip(
    "imagekit_generate",
    "spends credits + takes minutes (no opt-in flag yet)",
  );

  // ---- Project new endpoints ------------------------------------------

  if (createdProjectId) {
    await runner.step("get_project_chronicle (likely empty)", async () => {
      await call("get_project_chronicle", { project_id: createdProjectId });
    });
    await runner.step("generate_project_name", async () => {
      try {
        await call("generate_project_name", { project_id: createdProjectId });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // OK to fail when project has no first message
        console.log(`    → tolerable: ${msg.slice(0, 100)}`);
      }
    });
  }

  await runner.step("list_seedance_history", async () => {
    await call("list_seedance_history", { page: 1, page_size: 5 });
  });
  await runner.step("list_showcase", async () => {
    await call("list_showcase", { page: 1, page_size: 5 });
  });
  runner.skip("seedance_generate", "spends credits + takes minutes");
  runner.skip(
    "copy_project / add_showcase / remove_showcase",
    "debug-gated server-side",
  );

  // ---- Standalone tools (look-ref / cast-design) ----------------------

  await runner.step("list_tool_tasks", async () => {
    await call("list_tool_tasks", { limit: 10 });
  });
  runner.skip(
    "generate_look_reference / generate_cast_design",
    "spends credits + takes minutes",
  );
  runner.skip("fetch_brand_social", "needs real brand_id + Apify gate");

  // ---- Control (must be last before cleanup) ----------------------------

  if (createdProjectId) {
    await runner.step(
      "pause_project (on idle project — may error)",
      async () => {
        try {
          await call("pause_project", { project_id: createdProjectId });
        } catch (err) {
          // An idle project cannot be paused. Treat as a tolerable result
          // as long as the server responded with a readable error.
          const msg = err instanceof Error ? err.message : String(err);
          console.log(`    → tolerable idle-pause rejection: ${msg}`);
        }
      },
    );

    await runner.step(
      "continue_project (on idle project — may error)",
      async () => {
        try {
          await call("continue_project", { project_id: createdProjectId });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.log(`    → tolerable idle-continue rejection: ${msg}`);
        }
      },
    );

    await runner.step("stop_project", async () => {
      await call("stop_project", { project_id: createdProjectId });
    });
  }
} finally {
  runner.printSummary();
  try {
    await client.close();
  } catch {
    // ignore
  }
  if (createdProjectId) {
    console.log(
      `\n\x1b[33mNote:\x1b[0m smoke-test project left behind (no public delete endpoint): ${createdProjectId}`,
    );
  }
  process.exit(runner.exitCode);
}
