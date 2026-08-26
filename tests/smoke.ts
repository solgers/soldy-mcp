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
  await runner.step("plan_video_ad (option catalog)", async () => {
    const text = await call("plan_video_ad", {});
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error(
        `plan_video_ad did not return JSON: ${text.slice(0, 120)}`,
      );
    }
    if (!isRecord(parsed)) {
      throw new Error("plan_video_ad did not return an object");
    }
    if (!isRecord(parsed.templates) || !parsed.parameters) {
      throw new Error("plan_video_ad missing templates/parameters");
    }
    if (!isRecord(parsed.modules) || !Array.isArray(parsed.modules.items)) {
      throw new Error("plan_video_ad missing the module catalog");
    }
    if (!isRecord(parsed.hooks)) {
      throw new Error("plan_video_ad missing the hook catalog");
    }
    const live = parsed.templates.items;
    if (Array.isArray(live)) {
      // Live rows must carry what seedance_generate needs to submit them.
      for (const row of live) {
        if (!isRecord(row)) continue;
        if (typeof row.marketing_template_id !== "string") {
          throw new Error(
            "plan_video_ad template row is missing marketing_template_id",
          );
        }
        if (!isRecord(row.duration_range)) {
          throw new Error(
            `plan_video_ad template ${row.marketing_template_id} is missing duration_range`,
          );
        }
      }
      console.log(`    \u2192 ${live.length} published templates`);
    } else {
      console.log(
        `    \u2192 live template catalog unavailable: ${JSON.stringify(parsed.templates.error ?? "unknown")}`,
      );
    }
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
    if (!isRecord(parsed)) {
      throw new Error("list_video_ad_templates did not return an object");
    }
    if (
      !Array.isArray(parsed.modules) ||
      !Array.isArray(parsed.legacy_modules)
    ) {
      throw new Error("list_video_ad_templates is missing the module catalog");
    }
    // Mirrors seedanceAllowedModules (services/api/internal/models/
    // marketing_studio_module.go) minus the Recast Studio values, which the
    // MCP does not expose.
    const expectedModules = [
      "UGC",
      "UGC_Try_On",
      "Unboxing_ASMR",
      "This_Saved_Me",
      "Product_First",
      "Close_Up_Detail_Proof",
      "Show_The_Texture",
      "UGC_Showing_Product",
      "Routine_Insert",
      "Direct_To_Camera",
      "Giant_Figure",
      "Try_It_On_Face",
      "Show_How_It_Works",
      "Unboxing",
      "Hyper_Motion",
      "Before_After",
      "Sneakers_Try_On",
      "Model_Pro_Try_On",
      "TV_Spot",
      "Wild_Concept",
      "Testimonial",
    ];
    const expectedLegacy = [
      "Tutorial",
      "Product_Review",
      "Wild_Card",
      "UGC_Virtual_Try_On",
      "Pro_Virtual_Try_On",
    ];
    const assertSet = (label: string, got: unknown[], expected: string[]) => {
      const values = got
        .map((template) => templateValue(template))
        .filter((value): value is string => typeof value === "string");
      const missing = expected.filter((v) => !values.includes(v));
      const extra = values.filter((v) => !expected.includes(v));
      if (missing.length || extra.length) {
        throw new Error(
          `${label} drift — missing: [${missing.join(", ")}], extra: [${extra.join(", ")}]. ` +
            `Re-sync services/mcp/src/tools/video-ad-choices.ts with MarketingStudioTemplateModules / ` +
            `MarketingStudioLegacyModules (services/api/internal/models/marketing_studio_module.go) ` +
            `and the smoke test 'expected' lists.`,
        );
      }
      return values;
    };
    const modules = assertSet("template", parsed.modules, expectedModules);
    assertSet("legacy template", parsed.legacy_modules, expectedLegacy);
    if (templateValue(parsed.direct) !== "Direct") {
      throw new Error("list_video_ad_templates is missing the Direct fallback");
    }
    // hook_capable must match models.HookCapableModules exactly — a stale flag
    // sends the model into a guaranteed HOOK_MODULE_NOT_SUPPORTED rejection.
    const expectedHookCapable = [
      "UGC",
      "UGC_Try_On",
      "Unboxing_ASMR",
      "UGC_Showing_Product",
      "Routine_Insert",
      "Direct_To_Camera",
      "Giant_Figure",
      "Try_It_On_Face",
      "Unboxing",
      "Hyper_Motion",
      "Sneakers_Try_On",
      "Model_Pro_Try_On",
      "TV_Spot",
      "Wild_Concept",
      "Testimonial",
    ];
    const gotHookCapable = parsed.modules
      .filter((t) => isRecord(t) && t.hookCapable === true)
      .map((t) => templateValue(t))
      .filter((v): v is string => typeof v === "string");
    const hookMissing = expectedHookCapable.filter(
      (v) => !gotHookCapable.includes(v),
    );
    const hookExtra = gotHookCapable.filter(
      (v) => !expectedHookCapable.includes(v),
    );
    if (hookMissing.length || hookExtra.length) {
      throw new Error(
        `hook_capable drift — missing: [${hookMissing.join(", ")}], extra: [${hookExtra.join(", ")}]. ` +
          `Re-sync with models.HookCapableModules (services/api/internal/models/hook_capable_module.go).`,
      );
    }
    console.log(
      `    \u2192 ${modules.length} templates + ${expectedLegacy.length} legacy, ${gotHookCapable.length} hook-capable`,
    );
  });
  await runner.step("list_video_ad_hooks (read-only)", async () => {
    const text = await call("list_video_ad_hooks", { limit: 5 });
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error(
        `list_video_ad_hooks did not return JSON: ${text.slice(0, 120)}`,
      );
    }
    if (!isRecord(parsed) || !Array.isArray(parsed.presets)) {
      throw new Error("list_video_ad_hooks did not return a presets array");
    }
    console.log(`    \u2192 ${parsed.presets.length} preset hooks`);
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
