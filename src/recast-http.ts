import { z } from "zod";
import { adminOrigin } from "./recast-admin-origin.js";
export const recordID = z.string().regex(/^[a-zA-Z0-9_-]{1,96}$/);
export const requestKey = z.string().min(1).max(128);
export const output = (
  value: unknown,
): { content: { type: "text"; text: string }[] } => ({
  content: [{ type: "text", text: JSON.stringify(value) }],
});
export function api(scope: "admin" | "public") {
  const internal = scope === "admin";
  const base = internal
    ? adminOrigin(process.env.SOLDY_ADMIN_API_URL || "http://127.0.0.1:8081")
    : new URL(process.env.SOLDY_API_URL || "https://api.soldy.ai");
  if (
    base.username ||
    base.password ||
    (base.protocol !== "https:" &&
      !(
        base.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)
      ))
  )
    throw new Error("Invalid API origin");
  return async (path: string, body?: unknown, key?: string) => {
    const personalKey = process.env.SOLDY_API_KEY;
    const legacyToken =
      internal && !personalKey ? process.env.SOLDY_ADMIN_TOKEN : undefined;
    const credential = personalKey || legacyToken;
    if (!credential) throw new Error("Set SOLDY_API_KEY");
    const headers = new Headers({ "Content-Type": "application/json" });
    headers.set(
      legacyToken ? "Authorization" : "X-API-Key",
      legacyToken ? `Bearer ${legacyToken}` : credential,
    );
    const prefix =
      internal && personalKey ? "admin/recast-mcp" : `${scope}/recast`;
    if (key) headers.set("Idempotency-Key", key);
    const response = await fetch(
      new URL(`/api/v1/${prefix}/${path}`, base.origin),
      {
        headers,
        redirect: "error",
        method: body === undefined ? "GET" : "POST",
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(45000),
      },
    );
    if (internal && response.status === 409) {
      const error = z
        .object({ msg_code: z.literal("RECAST_AUTOMATION_DISABLED") })
        .safeParse(await response.json().catch(() => null));
      if (error.success)
        throw new Error(
          "Recast internal automation is disabled for this environment.",
        );
    }
    if (!response.ok) throw new Error(`Soldy HTTP ${response.status}`);
    const envelope = z
      .object({
        code: z.number(),
        msg: z.string().optional(),
        data: z.unknown().optional(),
        page: z.unknown().optional(),
      })
      .parse(await response.json());
    if (envelope.code !== 0)
      throw new Error(envelope.msg || "Soldy request failed");
    if (!("data" in envelope))
      throw new Error("Soldy success response is missing data");
    return envelope;
  };
}
