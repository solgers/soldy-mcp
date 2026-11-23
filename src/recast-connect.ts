#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";

import { adminOrigin } from "./recast-admin-origin.js";

async function readKey() {
  if (process.env.SOLDY_API_KEY) return process.env.SOLDY_API_KEY;
  if (!process.stdin.isTTY)
    throw new Error("Set SOLDY_API_KEY or run in a terminal.");
  const silent = new Writable({
    write(_data, _encoding, done) {
      done();
    },
  });
  const input = createInterface({
    input: process.stdin,
    output: silent,
    terminal: true,
  });
  process.stderr.write("Paste your Soldy API key (hidden): ");
  try {
    return (await input.question("")).trim();
  } finally {
    input.close();
    process.stderr.write("\n");
  }
}

async function installSkill(client: "codex" | "claude") {
  const root =
    client === "codex"
      ? process.env.CODEX_HOME || join(homedir(), ".codex")
      : process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
  const dir = join(root, "skills", "soldy-recast-admin");
  const target = join(dir, "SKILL.md");
  const bundled = await readFile(
    new URL("../skills/soldy-recast-admin/SKILL.md", import.meta.url),
  );
  await mkdir(dir, { recursive: true });
  const temp = join(dir, `.SKILL-${randomUUID()}.tmp`);
  try {
    await writeFile(temp, bundled, { flag: "wx" });
    await rename(temp, target);
  } finally {
    await rm(temp, { force: true });
  }
}

async function main() {
  const [client, address] = process.argv.slice(2);
  if (client !== "codex" && client !== "claude")
    throw new Error(
      "Usage: soldy-recast-connect <codex|claude> <admin-api-origin>",
    );
  const url = adminOrigin(address);
  const key = await readKey();
  if (!key.startsWith("sk_"))
    throw new Error("Expected a Soldy personal API key.");
  const name = "soldy-recast-admin";
  const args = [
    "-y",
    "--package",
    "@soldy_ai/mcp@0.8.2",
    "soldy-recast-internal-mcp",
  ];
  const env = { SOLDY_ADMIN_API_URL: url.origin, SOLDY_API_KEY: key };
  const command =
    client === "codex"
      ? [
          "mcp",
          "add",
          name,
          "--env",
          `SOLDY_ADMIN_API_URL=${url.origin}`,
          "--env",
          `SOLDY_API_KEY=${key}`,
          "--",
          "npx",
          ...args,
        ]
      : [
          "mcp",
          "add-json",
          "--scope",
          "user",
          name,
          JSON.stringify({ type: "stdio", command: "npx", args, env }),
        ];
  const result = spawnSync(client, command, {
    stdio: "pipe",
    encoding: "utf8",
  });
  if (result.error)
    throw new Error(
      `Could not start ${client}. Check that its CLI is installed and on PATH.`,
    );
  if (result.status !== 0)
    throw new Error(
      `${client} could not register ${name}. If this entry already exists, remove it with the client's MCP settings and rerun this command.`,
    );
  await installSkill(client);
  console.log(
    `Registered ${name} and installed its workflow skill in ${client}. Reopen your agent and list approved Recast candidates to verify access.`,
  );
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
