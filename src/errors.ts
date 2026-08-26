const friendlyMessages: Record<string, string> = {
  INSUFFICIENT_CREDITS:
    "Credits balance insufficient. Top up at https://soldy.ai/app/settings/billing",
  PROJECT_NOT_FOUND: "Project not found. Check the project_id.",
  WORKSPACE_NOT_FOUND: "Workspace not found.",
  BRAND_NOT_FOUND: "Brand not found. Check the brand_id.",
  PROJECT_LIMIT_EXCEEDED:
    "Project limit reached. Upgrade your plan or delete old projects.",
  RATE_LIMIT_EXCEEDED: "Too many requests. Please try again shortly.",
  BRAND_TASK_NOT_FOUND: "Brand task not found. Check the task_id.",
  API_KEY_REQUIRED: "API Key required. Set SOLDY_API_KEY environment variable.",
  INVALID_API_KEY: "API Key invalid or revoked.",
  TOKEN_REQUIRED: "Authentication required. Check your API key.",
  MARKETING_TEMPLATE_NOT_FOUND:
    "Marketing template not found or no longer published. Re-run plan_video_ad and pick a current marketing_template_id.",
  MARKETING_TEMPLATE_HOOK_NOT_ALLOWED:
    "That opening hook is not allowed for the selected template (or the template's `module` does not match). Check the template's hook_policy in plan_video_ad.",
  MARKETING_TEMPLATE_HOOK_DURATION_INVALID:
    "Duration is outside what this template allows. Use the template's duration_range from plan_video_ad (duration_range_with_hook when a hook_id is attached); `-1` auto is not accepted with a marketing_template_id.",
  HOOK_MODULE_NOT_SUPPORTED:
    "This template does not support opening hooks. Drop hook_id, or pick a hook_capable template.",
};

export function mapError(code: string, fallback: string): string {
  return friendlyMessages[code] ?? fallback;
}

export function formatApiError(resp: {
  msg?: string;
  msg_code?: string;
}): string {
  if (resp.msg_code && friendlyMessages[resp.msg_code]) {
    return friendlyMessages[resp.msg_code];
  }
  return resp.msg ?? "Unknown error";
}
