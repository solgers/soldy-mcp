import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
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

/**
 * Bridges WebSocket project subscriptions to MCP resource update notifications.
 *
 * When an MCP client subscribes to a resource URI (e.g. `soldy://project/{id}/status`),
 * this bridge connects to the API WebSocket, subscribes to the project, and forwards
 * relevant events as `sendResourceUpdated` notifications.
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

  constructor(
    private client: SoldyAPIClient,
    _apiUrl: string,
    private apiKey: string,
  ) {}

  /** Attach the low-level MCP Server instance for sending notifications. */
  setServer(server: Server) {
    this.server = server;
  }

  /** Subscribe to a project's WebSocket events. Call when MCP client subscribes to a resource. */
  async subscribeProject(projectId: string) {
    if (this.subscribedProjects.has(projectId)) return;
    this.subscribedProjects.add(projectId);

    await this.ensureConnected();
    this.sendProjectSubscribe(projectId);
  }

  /** Unsubscribe from a project. Call when no more MCP subscriptions reference it. */
  unsubscribeProject(projectId: string) {
    this.subscribedProjects.delete(projectId);
    // WebSocket protocol doesn't support unsubscribe, but we stop sending notifications
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
            // Also notify brand list when a new brand is extracted
            if (task.status === "finished") {
              this.server.sendResourceUpdated({ uri: "soldy://brands" });
              if (task.brand_id) {
                this.server.sendResourceUpdated({
                  uri: `soldy://brand/${task.brand_id}`,
                });
              }
              // Task completed — stop polling
              this.unsubscribeBrandTask(taskId);
            } else if (task.status === "failed") {
              // Task failed — stop polling
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

  /** Disconnect the WebSocket and stop all polling. */
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

    // Stop all brand task polls
    for (const [taskId, entry] of this.brandTaskPolls) {
      clearInterval(entry.interval);
      this.brandTaskPolls.delete(taskId);
    }
  }

  private async ensureConnected(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    if (this.connecting) {
      // Wait for ongoing connection
      await new Promise<void>((resolve) => {
        const check = () => {
          if (this.ws?.readyState === WebSocket.OPEN) resolve();
          else setTimeout(check, 100);
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
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        this.ws = ws;
        this.connecting = false;
        this.reconnectDelay = 1000;
        console.error("[SubscriptionBridge] WebSocket connected");

        // Re-subscribe all projects
        for (const projectId of this.subscribedProjects) {
          this.sendProjectSubscribe(projectId);
        }

        resolve();
      };

      ws.onmessage = (event) => {
        this.handleMessage(String(event.data));
      };

      ws.onclose = () => {
        console.error("[SubscriptionBridge] WebSocket closed");
        this.ws = null;
        this.connecting = false;
        this.scheduleReconnect();
      };

      ws.onerror = (err) => {
        console.error("[SubscriptionBridge] WebSocket error:", err);
        this.connecting = false;
        if (!this.ws) reject(new Error("WebSocket connection failed"));
      };
    });
  }

  private scheduleReconnect() {
    if (this.subscribedProjects.size === 0) return;
    if (this.reconnectTimer) return;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch((err) => {
        console.error("[SubscriptionBridge] Reconnect failed:", err);
        this.reconnectDelay = Math.min(
          this.reconnectDelay * 2,
          this.maxReconnectDelay,
        );
        this.scheduleReconnect();
      });
    }, this.reconnectDelay);
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

    const event = msg.event;
    const runId = msg.context?.run_id;

    // Status change notifications
    if (STATUS_EVENTS.has(event)) {
      this.server.sendResourceUpdated({
        uri: `soldy://project/${projectId}/status`,
      });
    }

    // Message notifications
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

    // Material notifications
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
