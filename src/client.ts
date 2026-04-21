import { readFile } from "node:fs/promises";
import { basename } from "node:path";

export interface ApiResponse<T = unknown> {
  code: number;
  msg: string;
  msg_code?: string;
  data?: T;
  page?: { total_count: number; page_index: number; page_count: number };
}

export interface Project {
  id: string;
  name: string;
  status: string;
  ratio: string;
  description: string;
  created_at: string;
  brand_id: string;
}

export interface Message {
  id: string;
  role: string;
  content: string;
  event: string;
  run_id: string;
  materials: Material[];
  tool: {
    name: string;
    input?: Record<string, unknown>;
    output?: Record<string, unknown>;
  } | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface Material {
  url: string;
  type: string;
  thumbnail?: string;
  display_title?: string;
  asset_category?: string;
}

export interface MaterialGroup {
  run_id: string;
  source: string;
  materials: Material[];
  created_at: string;
}

export interface Brand {
  id: string;
  name: string;
  description: string;
  stage: string;
}

export interface BrandTask {
  id: string;
  status: string;
  progress: number;
  brand_id: string;
  reason: string;
}

export class SoldyAPIClient {
  private cachedWorkspaceId: string | null = null;

  /** Short-lived cache for listProjects (avoids redundant calls during resources/list). */
  private projectsCache: { data: Project[]; expires: number } | null = null;
  private static readonly PROJECTS_CACHE_TTL = 5_000; // 5 seconds

  /** Short-lived cache for listBrands. */
  private brandsCache: { data: Brand[]; expires: number } | null = null;
  private static readonly BRANDS_CACHE_TTL = 5_000;

  constructor(
    private baseUrl: string,
    private apiKey: string,
  ) {}

  /**
   * Get the default workspace ID (first workspace in the org).
   * Cached after first call.
   */
  async getDefaultWorkspaceId(): Promise<string> {
    if (this.cachedWorkspaceId) return this.cachedWorkspaceId;
    const resp = await this.get<{ id: string; name: string }[]>(
      "/public/workspace/list",
    );
    const workspaces = resp.data ?? [];
    if (workspaces.length === 0) {
      throw new Error("No workspaces found. Create one at https://soldy.ai");
    }
    this.cachedWorkspaceId = workspaces[0].id;
    return this.cachedWorkspaceId;
  }

  private headers(): Record<string, string> {
    return {
      "X-API-Key": this.apiKey,
      "Content-Type": "application/json",
    };
  }

  private async request<T>(
    method: string,
    path: string,
    opts?: { body?: unknown; params?: Record<string, string> },
  ): Promise<ApiResponse<T>> {
    let url = `${this.baseUrl}/api/v1${path}`;
    if (opts?.params) {
      const qs = new URLSearchParams(opts.params).toString();
      url += `?${qs}`;
    }

    const res = await fetch(url, {
      method,
      headers: this.headers(),
      body: opts?.body ? JSON.stringify(opts.body) : undefined,
    });

    if (!res.ok) {
      throw new Error(`API ${method} ${path}: HTTP ${res.status}`);
    }

    return (await res.json()) as ApiResponse<T>;
  }

  async get<T>(
    path: string,
    params?: Record<string, string>,
  ): Promise<ApiResponse<T>> {
    return this.request<T>("GET", path, { params });
  }

  async post<T>(path: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>("POST", path, { body });
  }

  async delete<T>(
    path: string,
    opts?: { params?: Record<string, string>; body?: unknown },
  ): Promise<ApiResponse<T>> {
    return this.request<T>("DELETE", path, opts);
  }

  /** List all projects in the default workspace (cached for 5s). */
  async listProjects(page = 1, pageSize = 50): Promise<Project[]> {
    if (
      page === 1 &&
      this.projectsCache &&
      Date.now() < this.projectsCache.expires
    ) {
      return this.projectsCache.data;
    }
    const wsId = await this.getDefaultWorkspaceId();
    const resp = await this.get<Project[]>("/public/project/list", {
      workspace_id: wsId,
      page: String(page),
      page_size: String(pageSize),
    });
    const data = resp.data ?? [];
    if (page === 1) {
      this.projectsCache = {
        data,
        expires: Date.now() + SoldyAPIClient.PROJECTS_CACHE_TTL,
      };
    }
    return data;
  }

  /** Get a single project by ID. */
  async getProject(projectId: string): Promise<Project | undefined> {
    const resp = await this.get<Project>("/public/project", { id: projectId });
    return resp.data ?? undefined;
  }

  /** List messages for a project. */
  async listMessages(
    projectId: string,
    page = 1,
    pageSize = 100,
  ): Promise<{ messages: Message[]; total: number }> {
    const resp = await this.get<Message[]>("/public/project/message/list", {
      project_id: projectId,
      page: String(page),
      page_size: String(pageSize),
      sort: "created_at desc",
    });
    return {
      messages: resp.data ?? [],
      total: resp.page?.total_count ?? resp.data?.length ?? 0,
    };
  }

  /** Get all materials for a project. */
  async getMaterials(projectId: string): Promise<Material[]> {
    const resp = await this.get<Material[]>("/public/project/materials", {
      project_id: projectId,
    });
    return resp.data ?? [];
  }

  /** Get materials grouped by run_id. */
  async getMaterialsGrouped(projectId: string): Promise<MaterialGroup[]> {
    const resp = await this.get<MaterialGroup[]>(
      "/public/project/materials-group",
      { project_id: projectId },
    );
    return resp.data ?? [];
  }

  /** List all brands in the default workspace (cached for 5s). */
  async listBrands(): Promise<Brand[]> {
    if (this.brandsCache && Date.now() < this.brandsCache.expires) {
      return this.brandsCache.data;
    }
    const wsId = await this.getDefaultWorkspaceId();
    const resp = await this.get<Brand[]>("/public/brand/list", {
      workspace_id: wsId,
    });
    const data = resp.data ?? [];
    this.brandsCache = {
      data,
      expires: Date.now() + SoldyAPIClient.BRANDS_CACHE_TTL,
    };
    return data;
  }

  /** Get brand extraction task result. */
  async getBrandTaskResult(taskId: string): Promise<BrandTask | undefined> {
    const wsId = await this.getDefaultWorkspaceId();
    const resp = await this.post<BrandTask[]>("/public/brand/task/result", {
      task_ids: [taskId],
      workspace_id: wsId,
    });
    return resp.data?.[0] ?? undefined;
  }

  /** Get the WebSocket URL for this API. */
  getWebSocketUrl(apiKey: string, clientId?: string): string {
    const wsUrl = this.baseUrl.replace(/^http/, "ws");
    let url = `${wsUrl}/ws?api_key=${encodeURIComponent(apiKey)}`;
    if (clientId) {
      url += `&client_id=${encodeURIComponent(clientId)}`;
    }
    return url;
  }

  async uploadFile(
    path: string,
    filePath: string,
    fields?: Record<string, string>,
  ): Promise<ApiResponse> {
    const fileData = await readFile(filePath);
    const form = new FormData();
    form.append("file", new Blob([fileData]), basename(filePath));
    if (fields) {
      for (const [k, v] of Object.entries(fields)) {
        form.append(k, v);
      }
    }

    const res = await fetch(`${this.baseUrl}/api/v1${path}`, {
      method: "POST",
      headers: { "X-API-Key": this.apiKey },
      body: form,
    });

    if (!res.ok) {
      throw new Error(`Upload ${path}: HTTP ${res.status}`);
    }

    return (await res.json()) as ApiResponse;
  }
}
