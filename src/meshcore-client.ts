export type MeshcoreAgent = {
  id: string;
  name: string;
  description: string;
  category: string;
  agentType: "AGENT" | "TOOL" | "LLM";
  authType: "NONE" | "API_KEY" | "OAUTH2";
  pricingType: "FREE" | "PER_CALL" | "PER_TOKEN";
  pricePerCall: number | null;
  pricePerInputToken: number | null;
  pricePerOutputToken: number | null;
  finalPricePerCall: number | null;
  finalPricePerInputToken: number | null;
  finalPricePerOutputToken: number | null;
  healthStatus: "HEALTHY" | "UNHEALTHY" | "DEGRADED" | "UNKNOWN";
  teamName: string;
  gatewayUrl: string;
  documentationMarkdown: string | null;
  transportType: string | null;
  agentSource: string | null;
  createdAt: string;
  updatedAt: string;
};

export type GatewayResponse = {
  success: boolean;
  message: string;
  data?: unknown;
  error?: string;
  errorCode?: string;
};

export class MeshcoreClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.apiKey = apiKey;
  }

  private async request<T>(
    path: string,
    options?: { method?: string; body?: unknown; timeoutMs?: number },
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const method = options?.method ?? "GET";
    const timeoutMs = options?.timeoutMs ?? 30_000;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": this.apiKey,
        },
        body: options?.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });

      const text = await response.text();
      let data: T;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`Meshcore API returned non-JSON: ${text.slice(0, 200)}`);
      }

      if (!response.ok) {
        const err = data as unknown as { message?: string; error?: string };
        throw new Error(
          `Meshcore API error (${response.status}): ${err.error ?? err.message ?? text.slice(0, 200)}`,
        );
      }

      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  async search(query: string, limit = 10): Promise<MeshcoreAgent[]> {
    const params = new URLSearchParams({ query, limit: String(limit) });
    return this.request<MeshcoreAgent[]>(
      `/public/agents/search?${params}`,
    );
  }

  async getAgent(agentId: string): Promise<MeshcoreAgent> {
    return this.request<MeshcoreAgent>(`/public/${agentId}`);
  }

  async listAgents(): Promise<MeshcoreAgent[]> {
    return this.request<MeshcoreAgent[]>("/public/agents");
  }

  async listTools(): Promise<MeshcoreAgent[]> {
    return this.request<MeshcoreAgent[]>("/public/tools");
  }

  async listLLMs(): Promise<MeshcoreAgent[]> {
    return this.request<MeshcoreAgent[]>("/public/llms");
  }

  async invoke(
    agentId: string,
    payload: Record<string, unknown>,
    timeoutMs = 60_000,
  ): Promise<GatewayResponse> {
    return this.request<GatewayResponse>(`/gateway/call/${agentId}`, {
      method: "POST",
      body: { payload: JSON.stringify(payload) },
      timeoutMs,
    });
  }

  async invokeMultiple(
    requests: Array<{ agentId: string; payload: Record<string, unknown> }>,
    timeoutMs = 120_000,
  ): Promise<Array<{ agentId: string; result: GatewayResponse | { error: string } }>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const results = await Promise.allSettled(
        requests.map(async (req) => {
          const result = await this.invoke(req.agentId, req.payload, timeoutMs);
          return { agentId: req.agentId, result };
        }),
      );

      return results.map((r, i) => {
        if (r.status === "fulfilled") {
          return r.value;
        }
        return {
          agentId: requests[i]!.agentId,
          result: { error: r.reason?.message ?? "Unknown error" },
        };
      });
    } finally {
      clearTimeout(timer);
    }
  }
}
