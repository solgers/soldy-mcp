import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function connect(t, entry, env = {}) {
  const client = new Client({ name: "recast-regression", version: "1" });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [
        "--import",
        new URL("./fixtures/recast-api.mjs", import.meta.url).href,
        `dist/recast-${entry}.js`,
      ],
      env: { SOLDY_API_KEY: "sk_fixture", ...env },
    }),
  );
  t.after(() => client.close());
  return (name, args) => client.callTool({ name, arguments: args });
}

const task = {
  workspace_id: "workspace_1",
  template_id: "template_1",
  request_key: "123e4567-e89b-12d3-a456-426614174000",
};
function readSuccess(response) {
  assert.ok(!response.isError, response.content[0].text);
  return JSON.parse(response.content[0].text);
}
function checkError(response, message) {
  assert.equal(response.isError, true);
  assert.match(response.content[0].text, message);
}

test("a business failure without data preserves the API message", async (t) => {
  const call = await connect(t, "product");
  checkError(
    await call("create_recast_task", { ...task, workspace_id: "empty" }),
    /Insufficient credits/,
  );
});

test("public task keys are validated before submission and preserved on retries", async (t) => {
  const call = await connect(t, "product");
  for (const key of ["", "k".repeat(129)]) {
    checkError(
      await call("create_recast_task", { ...task, request_key: key }),
      /Invalid (?:input|arguments)/i,
    );
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    assert.equal(
      readSuccess(await call("create_recast_task", task)).data.key,
      task.request_key,
    );
  }
});

test("showcase scans validate categories for each sort mode", async (t) => {
  const call = await connect(t, "internal");
  const scan = (sort, categories) =>
    call("sync_showcases", {
      sort,
      categories,
      min_likes: 0,
      min_recreates: 0,
      max_pages: 1,
    });
  checkError(await scan("latest", ["pets"]), /Latest scans require/);
  checkError(await scan("latest", ["all", "pets"]), /Latest scans require/);
  checkError(
    await scan("trending", ["pets", "pets"]),
    /Categories must be unique/,
  );
  for (const [sort, categories] of [
    ["latest", ["all"]],
    ["trending", ["pets", "sports"]],
  ]) {
    assert.deepEqual(
      readSuccess(await scan(sort, categories)).data.categories,
      categories,
    );
  }
});

for (const [api, override, expected] of [
  ["https://api.soldy.ai", undefined, "https://soldy.ai"],
  [
    "https://api-staging.soldy.ai",
    "https://staging.soldy.ai",
    "https://staging.soldy.ai",
  ],
  ["http://localhost:8082", "http://localhost:3002", "http://localhost:3002"],
  ["http://[::1]:8080", "http://[::1]:3000", "http://[::1]:3000"],
  [
    "http://127.0.0.1:8080",
    "https://preview.example/",
    "https://preview.example",
  ],
]) {
  test(`task share link for ${api} resolves to ${expected}`, async (t) => {
    const env = { SOLDY_API_URL: api };
    if (override) env.SOLDY_WEB_URL = override;
    const call = await connect(t, "product", env);
    const result = readSuccess(
      await call("get_recast_task", { task_id: "task_1" }),
    );
    assert.equal(
      result.share_url,
      `${expected}/app/share/recast-studio/task_1`,
    );
  });
}
