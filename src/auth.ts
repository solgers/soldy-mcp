import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Browser-based login for the Soldy MCP server.
 *
 * Flow (no pre-configured API key needed):
 *   1. Start a loopback HTTP server on 127.0.0.1 with a random port.
 *   2. Open the user's browser at `<webUrl>/app/mcp-auth?port=<port>&state=<nonce>`.
 *      The page is behind the normal WorkOS web login; once authenticated it
 *      mints an API key (POST /public/api-keys) and redirects the browser to
 *      `http://127.0.0.1:<port>/callback?state=<nonce>&key=<api-key>`.
 *   3. The loopback server validates the state nonce, persists the key to
 *      ~/.soldy/credentials.json (0600), and shows a "return to your editor"
 *      page.
 *
 * The state nonce is single-use and unguessable, so a hostile local page
 * cannot inject a key; the server binds to 127.0.0.1 only.
 */

const CREDENTIALS_DIR = join(homedir(), ".soldy");
const CREDENTIALS_FILE = join(CREDENTIALS_DIR, "credentials.json");
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;

interface CredentialEntry {
  api_key: string;
  created_at: string;
}

type CredentialsFile = Record<string, CredentialEntry>;

function isCredentialEntry(value: unknown): value is CredentialEntry {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { api_key?: unknown }).api_key === "string"
  );
}

async function readCredentialsFile(): Promise<CredentialsFile> {
  try {
    const raw = await readFile(CREDENTIALS_FILE, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    const out: CredentialsFile = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (isCredentialEntry(v)) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

/** Load a previously stored API key for this API base URL, if any. */
export async function loadStoredApiKey(apiUrl: string): Promise<string | null> {
  const creds = await readCredentialsFile();
  return creds[apiUrl]?.api_key ?? null;
}

/** Persist an API key for this API base URL (file mode 0600). */
export async function storeApiKey(
  apiUrl: string,
  apiKey: string,
): Promise<void> {
  const creds = await readCredentialsFile();
  creds[apiUrl] = { api_key: apiKey, created_at: new Date().toISOString() };
  await mkdir(CREDENTIALS_DIR, { recursive: true });
  await writeFile(CREDENTIALS_FILE, `${JSON.stringify(creds, null, 2)}\n`, {
    mode: 0o600,
  });
  await chmod(CREDENTIALS_FILE, 0o600);
}

/** Drop the stored API key for this API base URL (e.g. after a 401). */
export async function clearStoredApiKey(apiUrl: string): Promise<void> {
  const creds = await readCredentialsFile();
  if (!(apiUrl in creds)) return;
  delete creds[apiUrl];
  if (Object.keys(creds).length === 0) {
    await rm(CREDENTIALS_FILE, { force: true });
    return;
  }
  await writeFile(CREDENTIALS_FILE, `${JSON.stringify(creds, null, 2)}\n`, {
    mode: 0o600,
  });
}

function openBrowser(url: string): void {
  const platform = process.platform;
  let command: string;
  let args: string[];
  if (platform === "darwin") {
    command = "open";
    args = [url];
  } else if (platform === "win32") {
    // `start` is a cmd builtin; the empty string is the window title slot.
    command = "cmd";
    args = ["/c", "start", "", url.replace(/&/g, "^&")];
  } else {
    command = "xdg-open";
    args = [url];
  }
  const child = spawn(command, args, { stdio: "ignore", detached: true });
  child.on("error", () => {
    // Non-fatal: the URL is also printed to stderr for manual opening.
  });
  child.unref();
}

const SUCCESS_HTML = `<!doctype html>
<html>
  <head><meta charset="utf-8" /><title>Soldy MCP — logged in</title></head>
  <body style="font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0b0b0c; color: #ececec;">
    <div style="text-align: center; max-width: 28rem;">
      <h1 style="font-size: 1.25rem; margin-bottom: 0.5rem;">You're logged in to Soldy</h1>
      <p style="color: #9a9aa2; font-size: 0.9rem;">The MCP server received your credentials. You can close this tab and return to your editor.</p>
    </div>
  </body>
</html>`;

const FAILURE_HTML = `<!doctype html>
<html>
  <head><meta charset="utf-8" /><title>Soldy MCP — login failed</title></head>
  <body style="font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0b0b0c; color: #ececec;">
    <div style="text-align: center; max-width: 28rem;">
      <h1 style="font-size: 1.25rem; margin-bottom: 0.5rem;">Login failed</h1>
      <p style="color: #9a9aa2; font-size: 0.9rem;">The callback was invalid or expired. Restart your MCP client to try again.</p>
    </div>
  </body>
</html>`;

/**
 * Run the browser login flow and return the freshly minted API key.
 * The key is persisted to the credentials file before resolving.
 */
export async function loginViaBrowser(
  apiUrl: string,
  webUrl: string,
): Promise<string> {
  const state = randomBytes(32).toString("hex");

  return new Promise<string>((resolve, reject) => {
    let settled = false;

    const server = createHttpServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (url.pathname !== "/callback") {
        res.writeHead(404).end();
        return;
      }
      const gotState = url.searchParams.get("state");
      const key = url.searchParams.get("key");
      if (settled || gotState !== state || !key) {
        res
          .writeHead(400, { "Content-Type": "text/html; charset=utf-8" })
          .end(FAILURE_HTML);
        return;
      }
      settled = true;
      res
        .writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
        .end(SUCCESS_HTML);
      clearTimeout(timer);
      // Persist before resolving so a crash right after login doesn't force
      // the user through the browser again.
      storeApiKey(apiUrl, key)
        .catch((err: unknown) => {
          console.error(
            `[Soldy MCP] Warning: could not persist credentials: ${String(err)}`,
          );
        })
        .finally(() => {
          server.close();
          resolve(key);
        });
    });

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      server.close();
      reject(
        new Error(
          "Browser login timed out after 5 minutes. Restart your MCP client to retry, or set SOLDY_API_KEY manually.",
        ),
      );
    }, LOGIN_TIMEOUT_MS);
    timer.unref();

    server.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(
        new Error(`Could not start login callback server: ${err.message}`),
      );
    });

    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        settled = true;
        clearTimeout(timer);
        server.close();
        reject(new Error("Login callback server has no TCP address"));
        return;
      }
      const loginUrl = `${webUrl}/app/mcp-auth?port=${address.port}&state=${state}`;
      console.error(
        `[Soldy MCP] No API key configured — opening browser to log in:\n[Soldy MCP]   ${loginUrl}`,
      );
      openBrowser(loginUrl);
    });
  });
}
