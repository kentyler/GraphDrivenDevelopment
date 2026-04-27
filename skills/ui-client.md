# UI Client

User-facing surfaces — natural language intake, application UIs — are external MCP clients that connect to the graph through the MCP server. They are not served by the backend. Any MCP-capable tool — Claude Desktop, Excel, Word, a custom web app, a CLI — can serve as a user-facing surface.

Admin surfaces (dashboard, intent detail, gap surface) are served by the backend. This skill file covers user-facing surfaces, which are external.

## Principle

The user-facing UI connects through the MCP endpoint at `/mcp`, the same way any MCP client would. This means user surfaces can be built, replaced, or supplemented in any tool that speaks MCP — without touching the backend. A user-facing surface can be served as static files from the same Express process (e.g., `public/chat/`) — the constraint is architectural, not deployment: the surface must be an MCP client, regardless of which process serves the bytes.

## Connection

The UI connects to the GDD MCP server as a client. The MCP TypeScript SDK provides client libraries:

```
npm install @modelcontextprotocol/sdk
```

```js
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StreamableHTTPClientTransport } = require("@modelcontextprotocol/sdk/client/streamableHttp.js");

const transport = new StreamableHTTPClientTransport(
  new URL("http://localhost:3000/mcp")
);
const client = new Client({ name: "gdd-ui", version: "1.0.0" });
await client.connect(transport);
```

All data flows through MCP tool calls. The UI does not access the database directly and does not call REST endpoints.

## Stack

The building LLM chooses the technology. The only requirement is that the UI can act as an MCP client. A web app, desktop app (Electron, Tauri), CLI dashboard, or terminal UI all work. The Layer 5 intents in `intent-graph-layers.md` define what must be shown, not how.

## Surfaces and their MCP tool mappings

These are the user-facing surfaces that connect through MCP. Admin surfaces (dashboard, intent detail, gap surface) are served by the backend — see Layer 5 in `intent-graph-layers.md`.

### Natural language intake

Where actors enter through natural language.

- **`ask`** — the natural language entry point. The LLM constructs the intent and returns the result.

The intake surface shows: what the user said, what the system understood, what was created in the graph.

### Composing agents and applications

Where users assemble skill file bundles into agents or applications.

- **`query_skills`** — available skills to compose
- **`create_intent`** — create the agent or application definition
- **`query_agents`** — existing agents

The composition surface lets users select skills, assign triggers/authorization (agent) or UI surfaces (application), and see the result.

## Build location

Build the UI in its own directory — separate from both the skill files (`gdd-install/`) and the backend (`GDD/`). A sibling directory like `GDD-UI/` keeps the separation clean.

## Testing against MCP

The UI's correctness is defined by the Layer 5 test conditions in `intent-graph-layers.md`. Each test condition describes what a human should be able to answer by looking at the surface. The UI passes when those questions are answerable through the MCP-connected interface.
