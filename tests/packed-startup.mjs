import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const tarball = resolve(process.argv[2]);
const dir = mkdtempSync(join(tmpdir(), "soldy-packed-"));
const fixtureKey = "sk_local_test_fixture";
const env = {
  PATH: process.env.PATH,
  HOME: dir,
  CODEX_HOME: join(dir, "codex"),
  CLAUDE_CONFIG_DIR: join(dir, "claude"),
  SOLDY_API_KEY: fixtureKey,
  npm_config_cache: join(dir, "npm-cache"),
};
function run(command, args, extra = {}) {
  return execFileSync(command, args, {
    cwd: dir,
    env: { ...env, ...extra },
    stdio: "pipe",
    encoding: "utf8",
    timeout: 60000,
  });
}
async function probe(command, args, settings, admin) {
  const client = new Client({ name: "packed-smoke", version: "1" });
  try {
    await client.connect(
      new StdioClientTransport({
        command,
        args,
        cwd: dir,
        env: { ...env, ...settings },
      }),
    );
    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name);
    assert.equal(names.includes("list_candidates"), admin);
    if (admin) {
      const response = await client.callTool({
        name: "list_candidates",
        arguments: { status: "approved", page: 1 },
      });
      assert.ok(!response.isError);
    } else {
      assert.ok(names.includes("avatar_search"));
    }
  } finally {
    await client.close();
  }
}
let requests = 0;
// Resolve @latest to the candidate tarball before the version exists on npm.
const registry = createServer((req, res) => {
  if (decodeURIComponent(req.url) === "/@soldy_ai/mcp") {
    const pkg = JSON.parse(
      readFileSync(
        join(dir, "node_modules/@soldy_ai/mcp/package.json"),
        "utf8",
      ),
    );
    const tarballUrl = `http://127.0.0.1:${registry.address().port}/candidate.tgz`;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        name: pkg.name,
        "dist-tags": { latest: pkg.version },
        versions: { [pkg.version]: { ...pkg, dist: { tarball: tarballUrl } } },
      }),
    );
  } else if (req.url === "/candidate.tgz") {
    res.end(readFileSync(tarball));
  } else {
    res.writeHead(404).end();
  }
});
const api = createServer((req, res) => {
  if (
    req.url !== "/api/v1/admin/recast-mcp/candidates?status=approved&page=1" ||
    req.headers["x-api-key"] !== fixtureKey
  ) {
    res.writeHead(403).end();
    return;
  }
  requests++;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ code: 0, data: [] }));
});
try {
  mkdirSync(env.CODEX_HOME);
  mkdirSync(env.CLAUDE_CONFIG_DIR);
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({
      private: true,
      dependencies: { "@soldy_ai/mcp": `file:${tarball}` },
    }),
  );
  execFileSync("bun", ["install"], {
    cwd: dir,
    stdio: "inherit",
    timeout: 120000,
  });
  await new Promise((resolve) => registry.listen(0, "127.0.0.1", resolve));
  writeFileSync(
    join(dir, ".npmrc"),
    `@soldy_ai:registry=http://127.0.0.1:${registry.address().port}/\n`,
  );
  await new Promise((resolve) => api.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${api.address().port}`;
  await probe("npx", ["-y", "@soldy_ai/mcp"], {}, false);
  console.log("Customer npx startup passed");
  const bin = (name) => join(dir, "node_modules", ".bin", name);
  for (const bad of [
    "https://example.org",
    "https://admin-api.soldy.ai.example.org",
    "http://admin-api.soldy.ai",
    "https://admin-api.soldy.ai:444",
    "https://user@admin-api.soldy.ai",
  ]) {
    assert.throws(
      () => run(bin("soldy-recast-connect"), ["codex", bad]),
      /Use a Soldy/,
    );
    assert.throws(
      () =>
        run(bin("soldy-recast-internal-mcp"), [], { SOLDY_ADMIN_API_URL: bad }),
      /Use a Soldy/,
    );
  }
  for (const agent of ["codex", "claude"]) {
    run(bin("soldy-recast-connect"), [agent, origin]);
    const skillRoot =
      agent === "codex" ? env.CODEX_HOME : env.CLAUDE_CONFIG_DIR;
    assert.equal(
      readFileSync(
        join(skillRoot, "skills/soldy-recast-admin/SKILL.md"),
        "utf8",
      ),
      readFileSync(
        join(
          dir,
          "node_modules/@soldy_ai/mcp/skills/soldy-recast-admin/SKILL.md",
        ),
        "utf8",
      ),
    );
    const config =
      agent === "codex"
        ? JSON.parse(
            run("codex", ["mcp", "get", "soldy-recast-admin", "--json"]),
          ).transport
        : JSON.parse(
            readFileSync(join(env.CLAUDE_CONFIG_DIR, ".claude.json"), "utf8"),
          ).mcpServers["soldy-recast-admin"];
    assert.equal(config.command, "npx");
    assert.equal(config.env.SOLDY_ADMIN_API_URL, origin);
    assert.deepEqual(config.args, [
      "-y",
      "--package",
      "@soldy_ai/mcp@latest",
      "soldy-recast-internal-mcp",
    ]);
    await probe(config.command, config.args, config.env, true);
    console.log(`${agent} registration and read-only tool call passed`);
  }
  assert.equal(requests, 2);
} finally {
  registry.close();
  api.close();
  rmSync(dir, { recursive: true, force: true });
}
