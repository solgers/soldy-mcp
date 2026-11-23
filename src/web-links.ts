export const DEFAULT_WEB_URL = "https://soldy.ai";

export function resolveWebUrl(apiUrl: string, explicitWebUrl?: string): string {
  if (explicitWebUrl) return trimTrailingSlash(explicitWebUrl);

  let parsed: URL;
  try {
    parsed = new URL(apiUrl);
  } catch {
    return DEFAULT_WEB_URL;
  }

  if (["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)) {
    return localWebUrl(parsed);
  }

  if (
    ["api-staging.soldy.ai", "staging-api.soldy.ai"].includes(parsed.hostname)
  ) {
    return "https://staging.soldy.ai";
  }

  return DEFAULT_WEB_URL;
}

export function seedanceShareUrl(webUrl: string, taskId: string): string {
  return `${trimTrailingSlash(webUrl)}/app/share/marketing-studio/${encodeURIComponent(taskId)}`;
}

function localWebUrl(apiUrl: URL): string {
  const apiPort = Number.parseInt(apiUrl.port || "8080", 10);
  const offset = Number.isFinite(apiPort) ? apiPort - 8080 : 0;
  const webPort = 3000 + Math.max(0, offset);
  return `${apiUrl.protocol}//${apiUrl.hostname}:${webPort}`;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}
