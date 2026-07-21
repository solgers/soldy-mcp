/**
 * Soldy MCP smoke test — spawn the built MCP server via stdio and exercise
 * every registered tool in a safe order. Requires a real API key + URL.
 *
 * The server exposes two one-shot generation paths — Quick Create
 * (video_* / image_*) and Marketing Studio (seedance_*) — plus the Product
 * Library (product_*) and Avatar Library (avatar_*) surfaces that supply
 * reusable product/avatar references to Marketing Studio. There are no
 * projects, brands, or a conversational agent.
 *
 * Run:
 *   SOLDY_API_URL=https://staging-api.soldy.ai SOLDY_API_KEY=xxx \
 *     bun run test:smoke
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
  process.exit(2);
}

const testsDir = fileURLToPath(new URL(".", import.meta.url));
const serverEntry = resolve(testsDir, "..", "dist", "index.js");

console.log(`\n\x1b[1mSoldy MCP smoke test\x1b[0m`);
console.log(`  API:    ${apiUrl}`);
console.log(`  Server: ${serverEntry}\n`);

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [serverEntry],
  env: childEnv({
    SOLDY_API_URL: apiUrl,
    SOLDY_API_KEY: apiKey,
  }),
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

function childEnv(extra: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) env[key] = value;
  }
  for (const [key, value] of Object.entries(extra)) {
    env[key] = value;
  }
  return env;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isToolResult(value: unknown): value is ToolResult {
  if (!isRecord(value)) return false;
  const content = value.content;
  if (content !== undefined && !Array.isArray(content)) return false;
  const isError = value.isError;
  return isError === undefined || typeof isError === "boolean";
}

function templateValue(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  const raw = value.value;
  return typeof raw === "string" ? raw : undefined;
}

function firstText(result: ToolResult): string {
  const c = result.content?.find((x): x is TextContent => x.type === "text");
  return c?.text ?? "";
}

async function call(name: string, args: Record<string, unknown>) {
  const res = await client.callTool({ name, arguments: args });
  if (!isToolResult(res)) {
    throw new Error(`${name} returned an invalid MCP tool result`);
  }
  if (res.isError) {
    throw new Error(firstText(res) || `${name} returned isError`);
  }
  return firstText(res);
}

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

  // ---- Quick Create (video_* / image_*) ---------------------------------

  await runner.step("video_list_models (unified registry)", async () => {
    const text = await call("video_list_models", {});
    if (!text.includes("seedance-2.0") || !text.includes("kling-2.6")) {
      throw new Error(
        `video_list_models registry drift: ${text.slice(0, 300)}`,
      );
    }
  });
  await runner.step("image_list_models (unified registry)", async () => {
    const text = await call("image_list_models", {});
    if (!text.includes("gpt-image-2") || !text.includes("gemini")) {
      throw new Error(
        `image_list_models registry drift: ${text.slice(0, 300)}`,
      );
    }
  });
  await runner.step("video_list_tasks", async () => {
    await call("video_list_tasks", { page: 1, page_size: 5 });
  });
  await runner.step("image_list_tasks", async () => {
    await call("image_list_tasks", { page: 1, page_size: 5 });
  });
  runner.skip(
    "video_generate",
    'spends credits + takes minutes — manual: { model: "kling-2.6", mode: "text_to_video", prompt: "...", parameters: { duration: 5 } }',
  );
  runner.skip(
    "image_generate",
    'spends credits + takes minutes — manual: { model: "gpt-image-2", mode: "text_to_image", prompt: "...", parameters: { image_size: "square_hd" } }',
  );

  // ---- Marketing Studio (seedance_*) ------------------------------------

  await runner.step("list_seedance_history", async () => {
    await call("list_seedance_history", { page: 1, page_size: 5 });
  });
  await runner.step("list_video_ad_templates (drift check)", async () => {
    const text = await call("list_video_ad_templates", {});
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error(
        `list_video_ad_templates did not return JSON: ${text.slice(0, 120)}`,
      );
    }
    if (!Array.isArray(parsed)) {
      throw new Error("list_video_ad_templates did not return an array");
    }
    const expected = [
      "UGC",
      "Tutorial",
      "Unboxing",
      "Hyper_Motion",
      "Product_Review",
      "TV_Spot",
      "Wild_Card",
      "UGC_Virtual_Try_On",
      "Pro_Virtual_Try_On",
      "Direct",
    ];
    const got = parsed
      .map((template) => templateValue(template))
      .filter((value): value is string => typeof value === "string");
    const missing = expected.filter((v) => !got.includes(v));
    const extra = got.filter((v) => !expected.includes(v));
    if (missing.length || extra.length) {
      throw new Error(
        `template drift — missing: [${missing.join(", ")}], extra: [${extra.join(", ")}]. ` +
          `Re-sync VIDEO_AD_TEMPLATES (services/mcp/src/tools/marketing.ts) with seedanceAllowedModules ` +
          `(services/api/internal/transport/rest/project/seedance_direct.go) and the smoke test 'expected' list.`,
      );
    }
    console.log(
      `    → ${got.length} templates: ${got.slice(0, 4).join(", ")}, …`,
    );
  });
  runner.skip(
    "seedance_generate",
    'spends credits + takes minutes — manual: { module: "UGC", prompt: "...", image_url: ["https://..."] }',
  );

  // ---- Avatar Library (avatar_*) ----------------------------------------

  await runner.step("avatar_search (read-only)", async () => {
    const text = await call("avatar_search", { limit: 5 });
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error(
        `avatar_search did not return JSON: ${text.slice(0, 120)}`,
      );
    }
    if (!parsed || !Array.isArray((parsed as { items?: unknown }).items)) {
      throw new Error("avatar_search did not return an items array");
    }
  });
  runner.skip(
    "avatar_select",
    'needs a real avatar_id from avatar_search — manual: { avatar_id: "..." }',
  );
  runner.skip(
    "avatar_upload",
    'mutates the avatar library — manual: { file_path: "/path/to/avatar.png" }',
  );

  // ---- Product Library (product_*) --------------------------------------

  runner.skip(
    "product_upload_images",
    'uploads bytes to object storage — manual: { file_paths: ["/path/to/product.png"] }',
  );
  runner.skip(
    "product_parse_url",
    'runs a VLM DirectToolCall (may spend credits) — manual: { product_url: "https://..." }',
  );
  runner.skip(
    "product_create / product_update / product_delete",
    'mutate the product library — manual: product_create({ name: "..." }) then update/delete by id',
  );
} finally {
  runner.printSummary();
  try {
    await client.close();
  } catch {
    // ignore
  }
  process.exit(runner.exitCode);
}
