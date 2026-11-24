globalThis.fetch = async (url, options) => {
  const path = url.pathname;
  if (path.endsWith("/tasks/task_1")) {
    return Response.json({
      code: 0,
      data: {
        id: "task_1",
        project_id: "project_1",
        status: "succeeded",
        current_stage: "done",
        charged_cost: 1,
      },
    });
  }
  if (path.endsWith("/template-tasks")) {
    const body = JSON.parse(options.body);
    if (body.workspace_id === "empty")
      return Response.json({ code: 1, msg: "Insufficient credits" });
    return Response.json({
      code: 0,
      data: { key: options.headers.get("Idempotency-Key") },
    });
  }
  if (path.endsWith("/quote"))
    return Response.json({
      code: 0,
      data: { count: url.searchParams.get("task_count") },
    });
  if (
    ["/syncs", "/workflows", "/evaluations", "/evaluations/capped"].some(
      (suffix) => path.endsWith(suffix),
    )
  )
    return Response.json({ code: 0, data: JSON.parse(options.body) });
  throw new Error(`Unexpected mock request ${path}`);
};
