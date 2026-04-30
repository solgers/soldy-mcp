import { EventEmitter } from "node:events";
import WebSocket from "ws";
import type { SoldyAPIClient } from "./client.js";

// ---------------------------------------------------------------------------
// Event classification (ported from subscriptions.ts)
// ---------------------------------------------------------------------------

/** Terminal events that end an agent run. */
export const TERMINAL_EVENTS = new Set([
  "RunCompleted",
  "RunError",
  "RunPaused",
  "RunCancelled",
  "TeamRunCompleted",
  "TeamRunError",
  "TeamRunCancelled",
  "AgentSystemError",
]);

/** Events that carry new message content. */
export const MESSAGE_EVENTS = new Set([
  "RunStarted",
  "RunContent",
  "RunContentCompleted",
  "RunIntermediateContent",
  "RunCompleted",
  "RunError",
  "RunPaused",
  "RunCancelled",
  "RunContinued",
  "ToolCallStarted",
  "ToolCallCompleted",
  "TeamRunStarted",
  "TeamRunContent",
  "TeamRunContentCompleted",
  "TeamRunIntermediateContent",
  "TeamRunCompleted",
  "TeamRunError",
  "TeamRunCancelled",
  "TeamToolCallStarted",
  "TeamToolCallCompleted",
  "ReasoningStarted",
  "ReasoningStep",
  "ReasoningCompleted",
  "TeamReasoningStarted",
  "TeamReasoningStep",
  "TeamReasoningCompleted",
  "AgentSystemError",
]);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ServerMessage {
  event: string;
  message: {
    message_id?: string;
    text?: string;
    materials?: MaterialRef[];
    tool?: { name: string; state?: string; input?: unknown; output?: unknown };
    role?: string;
    time?: string;
    metadata?: Record<string, unknown>;
  };
  context: {
    client_id?: string;
    project_id?: string;
    run_id?: string;
    fronted_id?: string;
  };
}

export interface MaterialRef {
  url: string;
  type: string;
  thumbnail?: string;
  display_title?: string;
  asset_category?: string;
}

export interface BufferedEvent {
  cursor: number;
  msg: ServerMessage;
  receivedAt: number;
}

export interface ChatResult {
  status: "completed" | "paused" | "cancelled" | "error" | "timeout";
  messages: ChatResultMessage[];
  materials: MaterialRef[];
  pause_reason?: string;
  /** Estimated credits cost surfaced when the run paused for confirmation. */
  pause_cost?: number;
  /** Tool name(s) that triggered the pause (e.g. image/video generation). */
  pause_tool_name?: string | string[];
  /** Whether the pause was triggered by a "large consumption" gate. */
  pause_large_consumption?: number;
  error_message?: string;
  /** Follow-up questions surfaced by the agent on completion. */
  follow_up_questions?: string[];
  /** True when the agent reported task_completed === false. */
  task_pending?: boolean;
  run_id?: string;
  cursor: string;
  elapsed_seconds: number;
}

export interface ChatResultMessage {
  role: string;
  content: string;
  event: string;
  tool?: {
    name: string;
    state?: string;
    output?: Record<string, unknown>;
  };
  materials?: MaterialRef[];
}

// ---------------------------------------------------------------------------
// ConnectionManager
// ---------------------------------------------------------------------------

/**
 * Manages the WebSocket connection to the Soldy backend.
 *
 * Key differences from the old SubscriptionBridge:
 * - **Lazy**: connection is opened on first `ensureConnected()`, not at startup.
 * - **client_id in-memory**: extracted from `SystemWelcome` and reused on reconnect.
 * - **Event buffering**: per-project event queues consumed by `waitForRunCompletion`
 *   and `getEventsSince`.
 * - **No HTTP polling fallback**: WebSocket-only with auto-reconnect.
 */
export class ConnectionManager {
  private ws: WebSocket | null = null;
  private connecting = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1000;
  private readonly maxReconnectDelay = 30000;

  /** client_id received from the backend, reused on reconnect. */
  private clientId: string | null = null;

  /** Projects we're subscribed to. */
  private subscribedProjects = new Set<string>();

  /** Per-project event buffers. */
  private projectEvents = new Map<string, BufferedEvent[]>();

  /** Monotonic cursor counter for event ordering. */
  private cursorCounter = 0;

  /** Per-project emitter — fires "event" when a new ServerMessage arrives. */
  private projectEmitters = new Map<string, EventEmitter>();

  /** Track last cursor per project for catch-up on reconnect. */
  private projectCursors = new Map<string, string>();

  private lastConnectTime = 0;
  private static readonly RAPID_CLOSE_MS = 3000;
  private wsConsecutiveFailures = 0;

  constructor(
    private client: SoldyAPIClient,
    private apiKey: string,
  ) {}

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /** Get the current client_id (null if not yet connected). */
  getClientId(): string | null {
    return this.clientId;
  }

  /** Ensure WebSocket is open (lazy — first call triggers connect). */
  async ensureConnected(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    if (this.connecting) {
      await this.waitForConnection();
      return;
    }
    await this.connect();
  }

  /** Subscribe to a project's events. Sends `ClientProjectSubscribe` on the WS. */
  async subscribeProject(projectId: string): Promise<void> {
    this.subscribedProjects.add(projectId);
    if (!this.projectEvents.has(projectId)) {
      this.projectEvents.set(projectId, []);
    }
    if (!this.projectEmitters.has(projectId)) {
      this.projectEmitters.set(projectId, new EventEmitter());
    }
    await this.ensureConnected();
    this.sendProjectSubscribe(projectId);
  }

  /** Unsubscribe from a project and clear its event buffer. */
  unsubscribeProject(projectId: string): void {
    this.subscribedProjects.delete(projectId);
    this.projectEvents.delete(projectId);
    this.projectEmitters.delete(projectId);
    this.projectCursors.delete(projectId);
  }

  /**
   * Block until the agent run for `projectId` reaches a terminal state
   * (completed, error, paused, cancelled) or until timeout.
   */
  async waitForRunCompletion(
    projectId: string,
    opts: { timeoutMs: number; signal?: AbortSignal },
  ): Promise<ChatResult> {
    const startTime = Date.now();
    const deadline = startTime + opts.timeoutMs;

    // Ensure we're subscribed
    await this.subscribeProject(projectId);

    const emitter = this.projectEmitters.get(projectId)!;

    // Check existing buffer first
    const terminalCheck = this.findTerminalEvent(projectId);
    if (terminalCheck) {
      return this.buildChatResult(projectId, terminalCheck.runId, startTime);
    }

    // Wait for events
    return new Promise<ChatResult>((resolve) => {
      let resolved = false;
      const finish = () => {
        if (resolved) return;
        resolved = true;
        emitter.removeListener("event", onEvent);
        clearTimeout(timer);

        const terminal = this.findTerminalEvent(projectId);
        resolve(
          this.buildChatResult(
            projectId,
            terminal?.runId ?? this.getLatestRunId(projectId),
            startTime,
          ),
        );
      };

      const onEvent = (msg: ServerMessage) => {
        if (TERMINAL_EVENTS.has(msg.event)) {
          finish();
        }
      };
      emitter.on("event", onEvent);

      const timer = setTimeout(finish, Math.max(0, deadline - Date.now()));

      opts.signal?.addEventListener("abort", finish, { once: true });
    });
  }

  /**
   * Get events since a cursor for a project.
   * If `waitMs > 0` and no events are available, waits up to `waitMs` for new ones.
   */
  async getEventsSince(
    projectId: string,
    cursor?: string,
    waitMs = 0,
  ): Promise<{ events: BufferedEvent[]; cursor: string }> {
    await this.subscribeProject(projectId);

    const cursorNum = cursor ? parseInt(cursor, 10) : 0;
    let events = this.getBufferedEventsAfter(projectId, cursorNum);

    if (events.length === 0 && waitMs > 0) {
      const emitter = this.projectEmitters.get(projectId);
      if (emitter) {
        await new Promise<void>((resolve) => {
          let resolved = false;
          const done = () => {
            if (resolved) return;
            resolved = true;
            emitter.removeListener("event", onEvent);
            clearTimeout(timer);
            resolve();
          };
          const onEvent = () => done();
          emitter.on("event", onEvent);
          const timer = setTimeout(done, waitMs);
        });
        events = this.getBufferedEventsAfter(projectId, cursorNum);
      }
    }

    const lastCursor =
      events.length > 0
        ? String(events[events.length - 1].cursor)
        : (cursor ?? "0");

    return { events, cursor: lastCursor };
  }

  /** Disconnect WebSocket and clean up all state. */
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connecting = false;
  }

  // -------------------------------------------------------------------------
  // WebSocket connection management
  // -------------------------------------------------------------------------

  private async waitForConnection(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
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
  }

  private async connect(): Promise<void> {
    this.connecting = true;

    const wsUrl = this.client.getWebSocketUrl(
      this.apiKey,
      this.clientId ?? undefined,
    );

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
        this.wsConsecutiveFailures = 0;
        this.reconnectDelay = 1000;
        console.error("[ConnectionManager] WebSocket connected");

        // Re-subscribe to all tracked projects
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
          uptime < ConnectionManager.RAPID_CLOSE_MS
        ) {
          this.wsConsecutiveFailures++;
          console.error(
            `[ConnectionManager] WebSocket closed (code=${code}) after ${uptime}ms (rapid #${this.wsConsecutiveFailures})`,
          );
        } else {
          console.error(`[ConnectionManager] WebSocket closed (code=${code})`);
        }
        this.scheduleReconnect();
      });

      ws.on("error", (err) => {
        clearTimeout(connectTimeout);
        console.error("[ConnectionManager] WebSocket error:", err.message);
        this.connecting = false;
        this.wsConsecutiveFailures++;
        if (!this.ws) reject(new Error("WebSocket connection failed"));
      });
    });
  }

  private scheduleReconnect(): void {
    if (this.subscribedProjects.size === 0) return;
    if (this.reconnectTimer) return;

    const delay = Math.min(
      this.reconnectDelay * 2 ** Math.max(0, this.wsConsecutiveFailures - 1),
      this.maxReconnectDelay,
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch((err) => {
        console.error("[ConnectionManager] Reconnect failed:", err.message);
        this.scheduleReconnect();
      });
    }, delay);
  }

  private sendProjectSubscribe(projectId: string): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;

    const msg: Record<string, string> = {
      event: "ClientProjectSubscribe",
      project_id: projectId,
    };

    // Send cursor for catch-up on reconnect
    const cursor = this.projectCursors.get(projectId);
    if (cursor) {
      msg.cursor = cursor;
    }

    this.ws.send(JSON.stringify(msg));
  }

  // -------------------------------------------------------------------------
  // Message handling
  // -------------------------------------------------------------------------

  private handleMessage(data: string): void {
    let msg: ServerMessage;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }

    // Extract client_id from welcome messages
    if (msg.event === "SystemWelcome" || msg.event === "SystemWelcomeBack") {
      if (msg.context?.client_id) {
        this.clientId = msg.context.client_id;
        console.error(`[ConnectionManager] client_id: ${this.clientId}`);
      }
      return;
    }

    // System events without project context — skip
    if (
      msg.event === "Pong" ||
      msg.event === "SystemError" ||
      msg.event === "AuthError"
    ) {
      if (msg.event === "SystemError" || msg.event === "AuthError") {
        console.error(`[ConnectionManager] ${msg.event}: ${msg.message?.text}`);
      }
      return;
    }

    const projectId = msg.context?.project_id;
    if (!projectId) return;

    // Buffer the event
    const buffer = this.projectEvents.get(projectId);
    if (buffer) {
      const cursor = ++this.cursorCounter;
      buffer.push({ cursor, msg, receivedAt: Date.now() });

      // Track cursor for reconnect catch-up (use message time if available)
      if (msg.message?.time) {
        this.projectCursors.set(
          projectId,
          String(new Date(msg.message.time).getTime()),
        );
      }

      // Notify waiters
      const emitter = this.projectEmitters.get(projectId);
      if (emitter) {
        emitter.emit("event", msg);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Event buffer helpers
  // -------------------------------------------------------------------------

  private getBufferedEventsAfter(
    projectId: string,
    cursorNum: number,
  ): BufferedEvent[] {
    const buffer = this.projectEvents.get(projectId);
    if (!buffer) return [];
    return buffer.filter((e) => e.cursor > cursorNum);
  }

  private findTerminalEvent(
    projectId: string,
  ): { runId: string | undefined } | null {
    const buffer = this.projectEvents.get(projectId);
    if (!buffer) return null;
    for (const entry of buffer) {
      if (TERMINAL_EVENTS.has(entry.msg.event)) {
        return { runId: entry.msg.context?.run_id };
      }
    }
    return null;
  }

  private getLatestRunId(projectId: string): string | undefined {
    const buffer = this.projectEvents.get(projectId);
    if (!buffer || buffer.length === 0) return undefined;
    // Walk backwards to find a run_id
    for (let i = buffer.length - 1; i >= 0; i--) {
      if (buffer[i].msg.context?.run_id) {
        return buffer[i].msg.context.run_id;
      }
    }
    return undefined;
  }

  // -------------------------------------------------------------------------
  // ChatResult builder
  // -------------------------------------------------------------------------

  private buildChatResult(
    projectId: string,
    runId: string | undefined,
    startTime: number,
  ): ChatResult {
    const buffer = this.projectEvents.get(projectId) ?? [];
    const elapsed = (Date.now() - startTime) / 1000;

    // Filter events for the specific run (or all if no runId)
    const runEvents = runId
      ? buffer.filter((e) => e.msg.context?.run_id === runId)
      : buffer;

    // Determine status from terminal event
    let status: ChatResult["status"] = "timeout";
    let pauseReason: string | undefined;
    let pauseCost: number | undefined;
    let pauseToolName: string | string[] | undefined;
    let pauseLargeConsumption: number | undefined;
    let errorMessage: string | undefined;
    let followUpQuestions: string[] | undefined;
    let taskPending: boolean | undefined;

    for (const entry of runEvents) {
      const md = entry.msg.message?.metadata;
      if (
        entry.msg.event === "RunCompleted" ||
        entry.msg.event === "TeamRunCompleted"
      ) {
        status = "completed";
        const rawCompletion = md?.completion;
        if (isRecord(rawCompletion)) {
          const fq = rawCompletion.follow_up_questions;
          if (Array.isArray(fq)) {
            const filtered = fq.filter(
              (q): q is string => typeof q === "string" && q.trim() !== "",
            );
            if (filtered.length > 0) followUpQuestions = filtered;
          }
          if (rawCompletion.task_completed === false) taskPending = true;
        }
      } else if (entry.msg.event === "RunPaused") {
        status = "paused";
        const pausedReason = md?.paused_reason;
        const legacyReason = md?.reason;
        if (typeof pausedReason === "string") {
          pauseReason = pausedReason;
        } else if (typeof legacyReason === "string") {
          pauseReason = legacyReason;
        } else {
          pauseReason = entry.msg.message?.text;
        }
        if (typeof md?.cost === "number") pauseCost = md.cost;
        const tn = md?.tool_name;
        if (typeof tn === "string") {
          pauseToolName = tn;
        } else if (Array.isArray(tn)) {
          const filtered = tn.filter(
            (s): s is string => typeof s === "string" && s.trim() !== "",
          );
          if (filtered.length > 0) pauseToolName = filtered;
        }
        if (typeof md?.large_consumption === "number") {
          pauseLargeConsumption = md.large_consumption;
        }
      } else if (
        entry.msg.event === "RunError" ||
        entry.msg.event === "TeamRunError" ||
        entry.msg.event === "AgentSystemError"
      ) {
        status = "error";
        errorMessage = entry.msg.message?.text;
      } else if (
        entry.msg.event === "RunCancelled" ||
        entry.msg.event === "TeamRunCancelled"
      ) {
        status = "cancelled";
      }
    }

    // Build messages — only include events with meaningful content
    const messages: ChatResultMessage[] = [];
    for (const entry of runEvents) {
      if (!MESSAGE_EVENTS.has(entry.msg.event)) continue;

      const m = entry.msg.message;
      // Skip events with no text and no tool and no materials
      if (!m?.text && !m?.tool?.name && !m?.materials?.length) continue;

      const resultMsg: ChatResultMessage = {
        role: m?.role ?? "agent",
        content: m?.text ?? "",
        event: entry.msg.event,
      };
      if (m?.tool?.name) {
        resultMsg.tool = { name: m.tool.name, state: m.tool.state };
        if (
          m.tool.output &&
          typeof m.tool.output === "object" &&
          !Array.isArray(m.tool.output)
        ) {
          resultMsg.tool.output = m.tool.output as Record<string, unknown>;
        }
      }
      if (m?.materials?.length) {
        resultMsg.materials = m.materials;
      }
      messages.push(resultMsg);
    }

    // Collect all unique materials
    const materialMap = new Map<string, MaterialRef>();
    for (const entry of runEvents) {
      const mats = entry.msg.message?.materials;
      if (mats) {
        for (const mat of mats) {
          if (mat.url) materialMap.set(mat.url, mat);
        }
      }
    }

    const lastCursor =
      buffer.length > 0 ? String(buffer[buffer.length - 1].cursor) : "0";

    return {
      status,
      messages,
      materials: [...materialMap.values()],
      pause_reason: pauseReason,
      pause_cost: pauseCost,
      pause_tool_name: pauseToolName,
      pause_large_consumption: pauseLargeConsumption,
      error_message: errorMessage,
      follow_up_questions: followUpQuestions,
      task_pending: taskPending,
      run_id: runId,
      cursor: lastCursor,
      elapsed_seconds: Math.round(elapsed * 10) / 10,
    };
  }
}
