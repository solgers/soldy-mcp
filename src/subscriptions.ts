import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import WebSocket from "ws";
import type { SoldyAPIClient } from "./client.js";

/** Events that indicate project status changed. */
const STATUS_EVENTS = new Set([
  "RunStarted",
  "RunCompleted",
  "RunError",
  "RunPaused",
  "RunCancelled",
  "RunContinued",
  "TeamRunStarted",
  "TeamRunCompleted",
  "TeamRunError",
  "TeamRunCancelled",
  "AgentSystemError",
]);

/** Events that carry new message content. */
const MESSAGE_EVENTS = new Set([
  "RunContent",
  "RunContentCompleted",
  "RunIntermediateContent",
  "ToolCallStarted",
  "ToolCallCompleted",
  "TeamRunContent",
  "TeamRunContentCompleted",
  "TeamRunIntermediateContent",
  "TeamToolCallStarted",
  "TeamToolCallCompleted",
  "ReasoningStarted",
  "ReasoningStep",
  "ReasoningCompleted",
  "TeamReasoningStarted",
  "TeamReasoningStep",
  "TeamReasoningCompleted",
  // Status events also produce messages
  ...STATUS_EVENTS,
]);

interface ServerMessage {
  event: string;
  message: {
    message_id?: string;
    text?: string;
    materials?: { url: string; type: string }[];
    role?: string;
  };
  context: {
    client_id?: string;
    project_id?: string;
    run_id?: string;
  };
}

/** Snapshot for detecting changes during HTTP polling fallback. */
interface ProjectSnapshot {
  status: string;
  messageCount: number;
  materialCount: number;
}

/**
 * Bridges project subscriptions to MCP resource update notifications.
 *
 * Primary transport: WebSocket (real-time, low latency).
 * Fallback transport: HTTP polling (activates automatically when WebSocket
 * is unavailable or repeatedly fails to connect).
 *
 * Both transports emit the same `sendResourceUpdated` notifications so MCP
 * clients get a consistent experience regardless of the underlying transport.
 */
export class SubscriptionBridge {
  private ws: WebSocket | null = null;
  private subscribedProjects = new Set<string>();
  private connecting = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;
  private server: Server | null = null;

  /** Brand task polling: taskId → { interval, lastStatus } */
  private brandTaskPolls = new Map<
    string,
    { interval: ReturnType<typeof setInterval>; lastStatus: string }
  >();
  private static readonly BRAND_TASK_POLL_MS = 3000;

  /** HTTP polling fallback state */
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private static readonly PROJECT_POLL_MS = 3000;
  private projectSnapshots = new Map<string, ProjectSnapshot>();
  private wsConsecutiveFailures = 0;
  private static readonly WS_FAILURE_THRESHOLD = 3;
  private usingPollingFallback = false;
  private lastConnectTime = 0;
  private static readonly RAPID_CLOSE_MS = 3000;

  constructor(
    private client: SoldyAPIClient,
    _apiUrl: string,
    private apiKey: string,
  ) {}

  /** Attach the low-level MCP Server instance for sending notifications. */
  setServer(server: Server) {
    this.server = server;
  }

  /** Subscribe to a project's updates. Tries WebSocket first, falls back to HTTP polling. */
  async subscribeProject(projectId: string) {
    if (this.subscribedProjects.has(projectId)) return;
    this.subscribedProjects.add(projectId);

    if (this.usingPollingFallback) {
      this.ensurePolling();
      return;
    }

    try {
      await this.ensureConnected();
      this.sendProjectSubscribe(projectId);
    } catch {
      console.error(
        "[SubscriptionBridge] WebSocket unavailable, activating HTTP polling fallback",
      );
      this.activatePollingFallback();
    }
  }

  /** Unsubscribe from a project. */
  unsubscribeProject(projectId: string) {
    this.subscribedProjects.delete(projectId);
    this.projectSnapshots.delete(projectId);

    if (this.subscribedProjects.size === 0) {
      this.stopPolling();
    }
  }

  /** Subscribe to brand task status changes via polling. */
  subscribeBrandTask(taskId: string) {
    if (this.brandTaskPolls.has(taskId)) return;

    const poll = {
      lastStatus: "",
      interval: setInterval(async () => {
        if (!this.server) return;
        try {
          const task = await this.client.getBrandTaskResult(taskId);
          if (!task) return;

          const entry = this.brandTaskPolls.get(taskId);
          if (!entry) return;

          if (task.status !== entry.lastStatus) {
            entry.lastStatus = task.status;
            this.server.sendResourceUpdated({
              uri: `soldy://brand/task/${taskId}`,
            });
            if (task.status === "finished") {
              this.server.sendResourceUpdated({ uri: "soldy://brands" });
              if (task.brand_id) {
                this.server.sendResourceUpdated({
                  uri: `soldy://brand/${task.brand_id}`,
                });
              }
              this.unsubscribeBrandTask(taskId);
            } else if (task.status === "failed") {
              this.unsubscribeBrandTask(taskId);
            }
          }
        } catch (err) {
          console.error(
            `[SubscriptionBridge] Brand task poll error (${taskId}):`,
            err,
          );
        }
      }, SubscriptionBridge.BRAND_TASK_POLL_MS),
    };

    this.brandTaskPolls.set(taskId, poll);
  }

  /** Stop polling a brand task. */
  unsubscribeBrandTask(taskId: string) {
    const entry = this.brandTaskPolls.get(taskId);
    if (entry) {
      clearInterval(entry.interval);
      this.brandTaskPolls.delete(taskId);
    }
  }

  /** Disconnect all transports and stop all polling. */
  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connecting = false;
    this.stopPolling();
    this.projectSnapshots.clear();

    for (const [, entry] of this.brandTaskPolls) {
      clearInterval(entry.interval);
    }
    this.brandTaskPolls.clear();
  }

  // ---------------------------------------------------------------------------
  // WebSocket transport
  // ---------------------------------------------------------------------------

  private async ensureConnected(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    if (this.connecting) {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error("WebSocket connect timeout")),
          15_000,
        );
        const check = () => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            clearTimeout(timeout);
            resolve();
          } else if (!this.connecting) {
            clearTimeout(timeout);
            reject(new Error("WebSocket connection failed"));
          } else {
            setTimeout(check, 100);
          }
        };
        check();
      });
      return;
    }
    await this.connect();
  }

  private async connect(): Promise<void> {
    this.connecting = true;

    const wsUrl = this.client.getWebSocketUrl(this.apiKey);

    return new Promise<void>((resolve, reject) => {
      let ws: WebSocket;
      try {
        ws = new WebSocket(wsUrl);
      } catch (err) {
        this.connecting = false;
        this.wsConsecutiveFailures++;
        reject(
          err instanceof Error ? err : new Error("WebSocket creation failed"),
        );
        return;
      }

      const connectTimeout = setTimeout(() => {
        this.connecting = false;
        this.wsConsecutiveFailures++;
        ws.close();
        reject(new Error("WebSocket connect timeout"));
      }, 10_000);

      ws.on("open", () => {
        clearTimeout(connectTimeout);
        this.ws = ws;
        this.connecting = false;
        this.lastConnectTime = Date.now();
        console.error("[SubscriptionBridge] WebSocket connected");

        for (const projectId of this.subscribedProjects) {
          this.sendProjectSubscribe(projectId);
        }

        resolve();
      });

      ws.on("message", (data) => {
        this.handleMessage(String(data));
      });

      ws.on("close", (code) => {
        const uptime = Date.now() - this.lastConnectTime;
        this.ws = null;
        this.connecting = false;
        if (
          this.lastConnectTime > 0 &&
          uptime < SubscriptionBridge.RAPID_CLOSE_MS
        ) {
          this.wsConsecutiveFailures++;
          console.error(
            `[SubscriptionBridge] WebSocket closed (code=${code}) after ${uptime}ms (rapid disconnect #${this.wsConsecutiveFailures})`,
          );
        } else {
          console.error(`[SubscriptionBridge] WebSocket closed (code=${code})`);
        }
        this.scheduleReconnect();
      });

      ws.on("error", (err) => {
        clearTimeout(connectTimeout);
        console.error("[SubscriptionBridge] WebSocket error:", err.message);
        this.connecting = false;
        this.wsConsecutiveFailures++;
        if (!this.ws) reject(new Error("WebSocket connection failed"));
      });
    });
  }

  private scheduleReconnect() {
    if (this.subscribedProjects.size === 0) return;
    if (this.reconnectTimer) return;

    if (
      this.wsConsecutiveFailures >= SubscriptionBridge.WS_FAILURE_THRESHOLD &&
      !this.usingPollingFallback
    ) {
      console.error(
        `[SubscriptionBridge] ${this.wsConsecutiveFailures} consecutive WebSocket failures, activating HTTP polling fallback`,
      );
      this.activatePollingFallback();
    }

    const delay = Math.min(
      this.reconnectDelay * 2 ** Math.max(0, this.wsConsecutiveFailures - 1),
      this.maxReconnectDelay,
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch((err) => {
        console.error("[SubscriptionBridge] Reconnect failed:", err.message);
        this.scheduleReconnect();
      });
    }, delay);
  }

  private sendProjectSubscribe(projectId: string) {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({
        event: "ClientProjectSubscribe",
        project_id: projectId,
      }),
    );
  }

  private handleMessage(data: string) {
    if (!this.server) return;

    let msg: ServerMessage;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }

    const projectId = msg.context?.project_id;
    if (!projectId || !this.subscribedProjects.has(projectId)) return;

    if (this.usingPollingFallback) {
      console.error(
        "[SubscriptionBridge] WebSocket recovered, stopping HTTP polling fallback",
      );
      this.stopPolling();
      this.usingPollingFallback = false;
    }
    this.wsConsecutiveFailures = 0;
    this.reconnectDelay = 1000;

    const event = msg.event;
    const runId = msg.context?.run_id;

    if (STATUS_EVENTS.has(event)) {
      this.server.sendResourceUpdated({
        uri: `soldy://project/${projectId}/status`,
      });
    }

    if (MESSAGE_EVENTS.has(event)) {
      this.server.sendResourceUpdated({
        uri: `soldy://project/${projectId}/messages`,
      });
      if (runId) {
        this.server.sendResourceUpdated({
          uri: `soldy://project/${projectId}/runs/${runId}/messages`,
        });
      }
    }

    if (msg.message?.materials?.length) {
      this.server.sendResourceUpdated({
        uri: `soldy://project/${projectId}/materials`,
      });
      if (runId) {
        this.server.sendResourceUpdated({
          uri: `soldy://project/${projectId}/runs/${runId}/materials`,
        });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // HTTP polling fallback — activated when WebSocket is unavailable
  // ---------------------------------------------------------------------------

  private activatePollingFallback() {
    this.usingPollingFallback = true;
    this.ensurePolling();
  }

  private ensurePolling() {
    if (this.pollInterval) return;
    if (this.subscribedProjects.size === 0) return;

    console.error(
      `[SubscriptionBridge] Starting HTTP polling for ${this.subscribedProjects.size} project(s)`,
    );

    this.pollInterval = setInterval(() => {
      this.pollAllProjects();
    }, SubscriptionBridge.PROJECT_POLL_MS);

    this.pollAllProjects();
  }

  private stopPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  private async pollAllProjects() {
    if (!this.server) return;

    const projects = [...this.subscribedProjects];
    await Promise.allSettled(projects.map((id) => this.pollProject(id)));
  }

  private async pollProject(projectId: string) {
    if (!this.server) return;

    try {
      const [project, { total: messageCount }, materials] = await Promise.all([
        this.client.getProject(projectId),
        this.client.listMessages(projectId, 1, 1),
        this.client.getMaterials(projectId),
      ]);

      if (!project) return;

      const prev = this.projectSnapshots.get(projectId);
      const current: ProjectSnapshot = {
        status: project.status,
        messageCount,
        materialCount: materials.length,
      };

      this.projectSnapshots.set(projectId, current);

      if (!prev) return;

      if (current.status !== prev.status) {
        this.server.sendResourceUpdated({
          uri: `soldy://project/${projectId}/status`,
        });
      }

      if (current.messageCount !== prev.messageCount) {
        this.server.sendResourceUpdated({
          uri: `soldy://project/${projectId}/messages`,
        });
      }

      if (current.materialCount !== prev.materialCount) {
        this.server.sendResourceUpdated({
          uri: `soldy://project/${projectId}/materials`,
        });
      }
    } catch (err) {
      console.error(
        `[SubscriptionBridge] Poll error (project ${projectId}):`,
        err instanceof Error ? err.message : err,
      );
    }
  }
}

/** Extract project_id from a soldy://project/... resource URI. */
export function extractProjectId(uri: string): string | null {
  const match = uri.match(/^soldy:\/\/project\/([^/]+)/);
  return match?.[1] ?? null;
}

/** Extract task_id from a soldy://brand/task/... resource URI. */
export function extractBrandTaskId(uri: string): string | null {
  const match = uri.match(/^soldy:\/\/brand\/task\/([^/]+)/);
  return match?.[1] ?? null;
}
