import { Type } from "@sinclair/typebox";
import type { MeshcoreClient, MeshcoreAgent } from "./meshcore-client.js";

function formatAgent(a: MeshcoreAgent): string {
  const price =
    a.pricingType === "FREE"
      ? "Free"
      : a.pricingType === "PER_CALL"
        ? `$${a.finalPricePerCall ?? a.pricePerCall}/call`
        : `$${a.finalPricePerInputToken ?? a.pricePerInputToken}/in + $${a.finalPricePerOutputToken ?? a.pricePerOutputToken}/out`;

  return [
    `**${a.name}** (${a.agentType})`,
    `  ID: ${a.id}`,
    `  ${a.description}`,
    `  Category: ${a.category} | Pricing: ${price} | Health: ${a.healthStatus}`,
  ].join("\n");
}

function formatAgentDetail(a: MeshcoreAgent): string {
  const lines = [
    `# ${a.name}`,
    `**Type:** ${a.agentType} | **Category:** ${a.category}`,
    `**Auth:** ${a.authType} | **Health:** ${a.healthStatus}`,
    `**Pricing:** ${a.pricingType}`,
    "",
    `## Description`,
    a.description,
  ];

  if (a.documentationMarkdown) {
    lines.push("", "## Documentation", a.documentationMarkdown);
  }

  return lines.join("\n");
}

export function createSearchTool(client: MeshcoreClient) {
  return {
    name: "meshcore_search",
    label: "Meshcore Search",
    description:
      "Search the Meshcore marketplace for AI agents, tools, and LLMs by capability. " +
      "Returns matching agents with descriptions, pricing, and IDs for invocation. " +
      "Use this when you need a specialist agent for a specific task.",
    parameters: Type.Object({
      query: Type.String({
        description:
          "Natural language search query describing the capability needed (e.g. 'stock analysis', 'code review', 'weather forecast')",
      }),
      limit: Type.Optional(
        Type.Number({
          description: "Maximum number of results to return (default: 10)",
        }),
      ),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const query = params.query as string;
      const limit = (params.limit as number) ?? 10;

      if (!query?.trim()) {
        throw new Error("query is required");
      }

      const agents = await client.search(query.trim(), limit);

      if (agents.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No agents found for "${query}". Try broadening your search terms.`,
            },
          ],
        };
      }

      const text = [
        `Found ${agents.length} agent(s) for "${query}":`,
        "",
        ...agents.map((a, i) => `${i + 1}. ${formatAgent(a)}`),
        "",
        "Use meshcore_info to get full details, or meshcore_invoke to call an agent.",
      ].join("\n");

      return {
        content: [{ type: "text" as const, text }],
        details: { agents: agents.map((a) => ({ id: a.id, name: a.name, type: a.agentType })) },
      };
    },
  };
}

export function createInfoTool(client: MeshcoreClient) {
  return {
    name: "meshcore_info",
    label: "Meshcore Agent Info",
    description:
      "Get detailed information about a specific Meshcore agent including documentation, " +
      "pricing, capabilities, and usage instructions. Use this before invoking an agent " +
      "to understand its input format and what it can do.",
    parameters: Type.Object({
      agentId: Type.String({
        description: "The UUID of the agent to get info about (from meshcore_search results)",
      }),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const agentId = params.agentId as string;
      if (!agentId?.trim()) {
        throw new Error("agentId is required");
      }

      const agent = await client.getAgent(agentId.trim());
      return {
        content: [{ type: "text" as const, text: formatAgentDetail(agent) }],
        details: { agent: { id: agent.id, name: agent.name, type: agent.agentType } },
      };
    },
  };
}

export function createInvokeTool(client: MeshcoreClient) {
  return {
    name: "meshcore_invoke",
    label: "Meshcore Invoke",
    description:
      "Call a Meshcore agent with a payload and get the result. " +
      "The payload format depends on the agent — use meshcore_info first to check. " +
      "Most agents accept a JSON object with a 'message' or 'query' field.",
    parameters: Type.Object({
      agentId: Type.String({
        description: "The UUID of the agent to invoke",
      }),
      payload: Type.Unknown({
        description:
          "JSON payload to send to the agent. Structure depends on the agent. " +
          'Common formats: {"message": "..."} or {"query": "..."} or OpenAI-compatible {"messages": [...]}',
      }),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const agentId = params.agentId as string;
      const payload = params.payload as Record<string, unknown>;

      if (!agentId?.trim()) {
        throw new Error("agentId is required");
      }
      if (!payload || typeof payload !== "object") {
        throw new Error("payload must be a JSON object");
      }

      const response = await client.invoke(agentId.trim(), payload);

      if (!response.success) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Agent call failed: ${response.error ?? response.message}`,
            },
          ],
        };
      }

      const text =
        typeof response.data === "string"
          ? response.data
          : JSON.stringify(response.data, null, 2);

      return {
        content: [{ type: "text" as const, text: `Agent response:\n\n${text}` }],
        details: { success: true, data: response.data },
      };
    },
  };
}

export function createAnalyzeTool(client: MeshcoreClient) {
  return {
    name: "meshcore_analyze",
    label: "Meshcore Multi-Agent Analyze",
    description:
      "Fan out a request to multiple Meshcore agents in parallel and get combined results. " +
      "Use this when you need multiple perspectives or data from different specialist agents. " +
      "All agents are called concurrently for speed.",
    parameters: Type.Object({
      requests: Type.Array(
        Type.Object({
          agentId: Type.String({ description: "Agent UUID to call" }),
          payload: Type.Unknown({ description: "Payload for this agent" }),
        }),
        {
          description: "Array of agent calls to make in parallel",
          minItems: 1,
          maxItems: 10,
        },
      ),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const requests = params.requests as Array<{
        agentId: string;
        payload: Record<string, unknown>;
      }>;

      if (!Array.isArray(requests) || requests.length === 0) {
        throw new Error("requests must be a non-empty array");
      }

      const results = await client.invokeMultiple(requests);

      const sections = results.map((r) => {
        const header = `### Agent: ${r.agentId}`;
        if ("error" in r.result) {
          return `${header}\n**Error:** ${r.result.error}`;
        }
        const resp = r.result;
        if (!resp.success) {
          return `${header}\n**Failed:** ${resp.error ?? resp.message}`;
        }
        const data =
          typeof resp.data === "string" ? resp.data : JSON.stringify(resp.data, null, 2);
        return `${header}\n${data}`;
      });

      return {
        content: [
          {
            type: "text" as const,
            text: [
              `## Multi-Agent Results (${results.length} agents)`,
              "",
              ...sections,
            ].join("\n\n"),
          },
        ],
        details: { results },
      };
    },
  };
}
