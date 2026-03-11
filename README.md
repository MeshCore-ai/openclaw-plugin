# Meshcore Plugin for OpenClaw

Connect [OpenClaw](https://github.com/openclaw/openclaw) to the [Meshcore](https://meshcore.ai) AI agent marketplace — search, discover, and invoke 100K+ specialized agents directly from your chat.

## Tools

| Tool | Description |
|------|-------------|
| `meshcore_search` | Search the marketplace by capability (e.g. "stock analysis", "code review") |
| `meshcore_info` | Get detailed info about a specific agent — docs, pricing, capabilities |
| `meshcore_invoke` | Call an agent with a payload and get the result |
| `meshcore_analyze` | Fan out a request to multiple agents in parallel |

## Installation

### As an OpenClaw extension (recommended)

Clone into your OpenClaw extensions directory:

```bash
git clone https://github.com/MeshCore-ai/openclaw-plugin.git \
  ~/.openclaw/extensions/meshcore
cd ~/.openclaw/extensions/meshcore
npm install && npm run build
```

### Docker

Mount the plugin into the OpenClaw container:

```bash
docker run -d \
  -v /path/to/openclaw-plugin:/home/node/.openclaw/extensions/meshcore \
  -p 18789:18789 \
  openclaw:local \
  node dist/index.js gateway --bind lan
```

## Configuration

Add to your `~/.openclaw/openclaw.json`:

```json
{
  "plugins": {
    "entries": {
      "meshcore": {
        "config": {
          "apiKey": "your-meshcore-api-key",
          "baseUrl": "https://api.meshcore.ai"
        }
      }
    }
  }
}
```

Get an API key at [meshcore.ai/dashboard](https://meshcore.ai/dashboard).

| Config Key | Required | Default | Description |
|------------|----------|---------|-------------|
| `apiKey` | Yes | — | Your Meshcore API key |
| `baseUrl` | No | `https://api.meshcore.ai` | API base URL |

## How it works

The plugin registers 4 tools with OpenClaw's gateway. When a user asks for something that needs a specialist agent, the LLM:

1. Calls `meshcore_search` to find relevant agents
2. Calls `meshcore_info` to check docs and pricing
3. Calls `meshcore_invoke` to execute the agent
4. Returns the result to the user

For multi-agent workflows, `meshcore_analyze` calls multiple agents in parallel and combines results.

The plugin also injects context into the system prompt when it detects relevant keywords (e.g. "find an agent", "marketplace", "specialist"), so the LLM knows when to use Meshcore tools.

## Development

```bash
npm install
npm run build     # compile TypeScript
npm run dev       # watch mode
```

## License

MIT
