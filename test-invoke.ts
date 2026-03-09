import { MeshcoreClient } from "./src/meshcore-client.js";

const client = new MeshcoreClient(
  "https://api.meshcore.ai",
  "aimesh_Mb_9iVYx1mZ3w-5AStKvf-_3CpRcgIteD2pXS9iDaaA",
);

async function main() {
  // Find a free LLM to test with
  const llms = await client.listLLMs();
  console.log("Total LLMs:", llms.length);

  const freeLlm = llms.find((l) => l.pricingType === "FREE");
  if (freeLlm) {
    console.log(`Found free LLM: ${freeLlm.name} (${freeLlm.id})`);
    try {
      const result = await client.invoke(freeLlm.id, {
        messages: [{ role: "user", content: "Say hello in one sentence." }],
        max_tokens: 50,
      });
      console.log("Success:", result.success);
      const data = typeof result.data === "string" ? result.data : JSON.stringify(result.data, null, 2);
      console.log("Response:", data?.slice(0, 500));
    } catch (err) {
      console.log("Free LLM invoke error:", (err as Error).message);
    }
  } else {
    console.log("No free LLMs available.");
  }

  // Try a free custom agent
  const agents = await client.listAgents();
  console.log("\nTotal Agents:", agents.length);
  const freeAgent = agents.find(
    (a) => a.pricingType === "FREE" && a.healthStatus === "HEALTHY" && a.agentType === "AGENT",
  );
  if (freeAgent) {
    console.log(`Found free healthy agent: ${freeAgent.name} (${freeAgent.id})`);
    try {
      const result = await client.invoke(freeAgent.id, {
        message: "Hello, what can you do?",
      });
      console.log("Success:", result.success);
      const data = typeof result.data === "string" ? result.data : JSON.stringify(result.data, null, 2);
      console.log("Response:", data?.slice(0, 500));
    } catch (err) {
      console.log("Agent invoke error:", (err as Error).message);
    }
  } else {
    console.log("No free healthy agents available.");
  }
}

main().catch(console.error);
