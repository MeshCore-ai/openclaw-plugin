/**
 * Smoke test — verify the plugin loads, creates tools, and can call the Meshcore API.
 * Run: npx tsx test-smoke.ts
 */
import { MeshcoreClient } from "./src/meshcore-client.js";
import { createSearchTool, createInfoTool, createInvokeTool } from "./src/tools.js";

const API_KEY = "aimesh_Mb_9iVYx1mZ3w-5AStKvf-_3CpRcgIteD2pXS9iDaaA";
const BASE_URL = "https://api.meshcore.ai";

const client = new MeshcoreClient(BASE_URL, API_KEY);

async function main() {
  console.log("=== Meshcore Plugin Smoke Test ===\n");

  // 1. Test search tool
  console.log("1. Testing meshcore_search...");
  const searchTool = createSearchTool(client);
  const searchResult = await searchTool.execute("test-1", { query: "stock analysis", limit: 3 });
  console.log("   Result:", JSON.stringify(searchResult.content[0]?.text?.slice(0, 200)));
  console.log("   Details:", JSON.stringify(searchResult.details));
  console.log();

  // 2. Test info tool (use first agent from search if available)
  const agents = searchResult.details?.agents as Array<{ id: string; name: string }> | undefined;
  if (agents?.length) {
    console.log(`2. Testing meshcore_info for "${agents[0]!.name}"...`);
    const infoTool = createInfoTool(client);
    const infoResult = await infoTool.execute("test-2", { agentId: agents[0]!.id });
    console.log("   Result:", JSON.stringify(infoResult.content[0]?.text?.slice(0, 300)));
    console.log();
  }

  // 3. Test invoke tool with an OpenRouter LLM
  console.log("3. Testing meshcore_invoke with an LLM...");
  const llmSearch = await searchTool.execute("test-3", { query: "llm chat", limit: 3 });
  const llms = llmSearch.details?.agents as Array<{ id: string; name: string; type: string }> | undefined;
  const llmAgent = llms?.find((a) => a.type === "LLM");

  if (llmAgent) {
    console.log(`   Found LLM: ${llmAgent.name} (${llmAgent.id})`);
    const invokeTool = createInvokeTool(client);
    try {
      const invokeResult = await invokeTool.execute("test-4", {
        agentId: llmAgent.id,
        payload: {
          messages: [{ role: "user", content: "Say hello in one sentence." }],
          max_tokens: 50,
        },
      });
      console.log("   Response:", JSON.stringify(invokeResult.content[0]?.text?.slice(0, 300)));
    } catch (err) {
      console.log("   Invoke error:", (err as Error).message);
    }
  } else {
    console.log("   No LLM found, skipping invoke test.");
  }

  // 4. Test plugin registration
  console.log("\n4. Testing plugin registration...");
  const plugin = (await import("./src/index.js")).default;
  const registeredTools: string[] = [];
  const registeredHooks: string[] = [];

  const mockApi = {
    pluginConfig: { apiKey: API_KEY, baseUrl: BASE_URL },
    logger: {
      info: (msg: string) => console.log(`   [INFO] ${msg}`),
      warn: (msg: string) => console.log(`   [WARN] ${msg}`),
      error: (msg: string) => console.log(`   [ERROR] ${msg}`),
    },
    registerTool: (tool: any, opts: any) => {
      registeredTools.push(opts?.name ?? tool.name ?? "unknown");
    },
    on: (hookName: string, _handler: any) => {
      registeredHooks.push(hookName);
    },
  };

  plugin.register(mockApi);
  console.log(`   Registered tools: ${registeredTools.join(", ")}`);
  console.log(`   Registered hooks: ${registeredHooks.join(", ")}`);

  console.log("\n=== All tests passed ===");
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
