import { MeshcoreClient } from "./meshcore-client.js";
import { createSearchTool, createInfoTool, createInvokeTool, createAnalyzeTool } from "./tools.js";

// Minimal types from OpenClaw plugin SDK — avoids requiring openclaw at build time
type PluginLogger = {
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
};

type OpenClawPluginApi = {
  pluginConfig?: Record<string, unknown>;
  logger: PluginLogger;
  registerTool: (tool: unknown, opts?: { name?: string }) => void;
  on: (
    hookName: string,
    handler: (event: { prompt: string; messages?: unknown[] }) => unknown,
  ) => void;
};

const meshcorePlugin = {
  id: "meshcore",
  name: "Meshcore",
  description:
    "Connect to the Meshcore AI agent marketplace — search, discover, and invoke 100K+ specialized agents",

  register(api: OpenClawPluginApi) {
    const config = api.pluginConfig ?? {};
    const apiKey = config.apiKey as string;
    const baseUrl = (config.baseUrl as string) ?? "https://api.meshcore.ai";

    if (!apiKey) {
      api.logger.warn(
        "Meshcore plugin: no apiKey configured. Tools will not be registered. " +
          "Set meshcore.apiKey in your OpenClaw config.",
      );
      return;
    }

    const client = new MeshcoreClient(baseUrl, apiKey);

    const toolDefs = [
      createSearchTool(client),
      createInfoTool(client),
      createInvokeTool(client),
      createAnalyzeTool(client),
    ];

    for (const def of toolDefs) {
      api.registerTool(def, { name: def.name });
    }

    // Inject context about available Meshcore capabilities into the system prompt
    api.on("before_prompt_build", (event) => {
      const prompt = event.prompt?.toLowerCase() ?? "";

      // Only inject context when the user's message hints at needing external agents
      const triggers = [
        "agent",
        "marketplace",
        "meshcore",
        "specialist",
        "expert",
        "analyze",
        "stock",
        "weather",
        "translate",
        "search for",
        "find an agent",
        "find a tool",
        "find an llm",
      ];

      const shouldInject = triggers.some((t) => prompt.includes(t));
      if (!shouldInject) return;

      return {
        appendSystemContext: [
          "## Meshcore Agent Marketplace",
          "You have access to the Meshcore marketplace with 100K+ specialized AI agents.",
          "Use `meshcore_search` to find agents by capability, `meshcore_info` to get details,",
          "and `meshcore_invoke` to call them. Use `meshcore_analyze` for multi-agent fan-out.",
          "Always search first, then check agent info before invoking.",
        ].join("\n"),
      };
    });

    api.logger.info(`Meshcore plugin registered (${toolDefs.length} tools, base: ${baseUrl})`);
  },
};

export default meshcorePlugin;
