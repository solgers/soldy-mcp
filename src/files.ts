import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import type { SoldyAPIClient } from "./client.js";

/**
 * Resolve a user-supplied local file path to an absolute path the MCP process
 * can read. Expands a leading `~` / `~/...` to the home directory and resolves
 * relative paths against the current working directory. Throws if the file
 * does not exist so callers surface a clear error before hitting the network.
 */
export function resolveLocalFilePath(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Empty file path.");
  }
  const expanded =
    trimmed === "~"
      ? homedir()
      : trimmed.startsWith("~/")
        ? resolve(homedir(), trimmed.slice(2))
        : trimmed;
  const absPath = resolve(expanded);
  if (!existsSync(absPath)) {
    throw new Error(`Local file not found: ${input}`);
  }
  return absPath;
}

/**
 * Detect if a string is a local file path (not a URL).
 */
function isLocalPath(s: string): boolean {
  if (s.startsWith("http://") || s.startsWith("https://")) return false;
  if (
    s.startsWith("/") ||
    s.startsWith("./") ||
    s.startsWith("../") ||
    s.startsWith("~")
  )
    return true;
  // Windows paths
  if (/^[A-Z]:\\/i.test(s)) return true;
  // Relative path that exists
  return existsSync(s);
}

/**
 * Resolve material URLs: local files get uploaded, HTTP URLs pass through.
 * Returns an array of GCS URLs ready for the API.
 */
export async function resolveUrls(
  client: SoldyAPIClient,
  urls: string[],
): Promise<string[]> {
  const results: string[] = [];

  for (const raw of urls) {
    if (isLocalPath(raw)) {
      const absPath = resolve(raw);
      if (!existsSync(absPath)) {
        throw new Error(`Local file not found: ${raw}`);
      }
      const resp = await client.uploadFile("/public/material", absPath);
      if (resp.code !== 0 || !resp.data) {
        throw new Error(`Upload failed for ${raw}: ${resp.msg}`);
      }
      const data = resp.data as { url?: string };
      if (!data.url) {
        throw new Error(`Upload returned no URL for ${raw}`);
      }
      results.push(data.url);
    } else {
      // HTTP URL — pass through directly
      results.push(raw);
    }
  }

  return results;
}
