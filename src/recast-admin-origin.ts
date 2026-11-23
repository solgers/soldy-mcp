const hostedOrigins = new Set([
  "https://admin-api.soldy.ai",
  "https://admin-api-staging.soldy.ai",
]);

export function adminOrigin(address: string): URL {
  const url = new URL(address);
  const loopback =
    (url.protocol === "http:" || url.protocol === "https:") &&
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);

  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    (!hostedOrigins.has(url.origin) && !loopback)
  ) {
    throw new Error(
      "Use a Soldy staging or production admin API origin, or a loopback address for local development.",
    );
  }
  return url;
}
