# MCP Server

The GDD system exposes an MCP (Model Context Protocol) server so external tools can connect to the intent graph. This makes the graph reachable from inside any MCP-capable application — Excel, Word, PowerPoint, Claude Desktop, or any tool with an MCP connector.

The MCP server is not a separate service. It runs inside the existing Express app.

## Dependencies

```
npm install @modelcontextprotocol/sdk
```

## Setup

Add the MCP server alongside the existing Express routes. A single endpoint — `/mcp` — serves the MCP protocol using Streamable HTTP transport. The SDK provides `McpServer` for tool registration and `StreamableHTTPServerTransport` for wiring into Express routes. Check the SDK version you installed for the exact API — the transport class and middleware helpers have changed across versions. The builder should consult the SDK's README or examples for the current wiring pattern.

The essential shape:

1. Create an `McpServer` instance with name `"gdd"` and version `"1.0.0"`
2. Register all tools (see below)
3. Mount a route at `/mcp` that creates a `StreamableHTTPServerTransport`, connects it to the server, and handles the request/response cycle

The SDK handles protocol negotiation. The builder chooses the exact wiring based on the installed SDK version.

## Tools

Most MCP tools map directly to existing graph operations. Some — like `ask` (composes intent construction with expression recording) and `configure_provider` (infrastructure configuration) — compose multiple operations or expose capabilities not separately named in the graph layer.

### ask

Natural language entry point. The user says something; the LLM constructs the intent (name, type, test condition, expression) and satisfies it in the same session. Returns the result to the caller.

- **Input**: `{ text: string }` — the natural language ask
- **Maps to**: `clientSession` / `translateRepresentation` + intent creation + expression recording
- **Requires**: Active LLM provider configured

### query_incomplete

What's red. Returns active intents that need expressions.

- **Input**: `{ execution?: "deterministic" | "llm-mediated", scope?: string }` — optional filters
- **Maps to**: `queryIncomplete`

### query_skills

What capabilities exist. Returns skill directory entries.

- **Input**: `{ category?: string }` — optional category filter
- **Maps to**: `SELECT` on `gdd.skills`

### build_projection

Full context for a given intent — dependencies, test condition, expressions, sessions.

- **Input**: `{ intent_id: string }`
- **Maps to**: `buildProjection` + `renderHuman` or `renderLLM`

### create_intent

Direct graph operation for actors who speak graph.

- **Input**: `{ name, type, test_condition, test_verification, description, blocked_by? }`
- **Maps to**: `createIntent`

### record_expression

Record work done against an intent.

- **Input**: `{ intent_id, artifacts, summary }`
- **Maps to**: `recordExpression`

### create_gap

Pull the andon cord.

- **Input**: `{ name, notes }`
- **Maps to**: gap node creation

### query_agents

What agents exist and their status.

- **Input**: `{ status?: string }`
- **Maps to**: `queryAgents`

### configure_provider

Add, update, remove, or set the active LLM provider.

- **Input**: `{ action: "add" | "update" | "remove" | "set_active" | "list", provider?: string, api_key?: string, model?: string, id?: string }`
- **Maps to**: CRUD on `gdd.llm_providers` via `/api/settings/llm`

## Connecting from external tools

### Claude for Excel

1. Ensure the GDD server is running (default: `http://localhost:3000`)
2. In Excel, open the Claude add-in
3. Go to Settings → Connectors → Custom Connectors
4. Add a new connector with URL: `http://localhost:3000/mcp`
5. The graph is now reachable from inside Excel — ask questions, query intents, surface gaps

### Claude for Word

Same steps as Excel, using the Claude for Word add-in.

### Claude for PowerPoint

Same steps as Excel, using the Claude for PowerPoint add-in.

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "gdd": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

### Any MCP-capable tool

Point the tool's MCP connector at `http://localhost:3000/mcp`. The protocol is standard — any tool that speaks MCP can connect.

## Connector skill files

When a new connector is set up, the LLM should write a skill file capturing the setup steps and any tool-specific details (what works well, what limitations exist, what the user typically does through that surface). Register it in `gdd.skills` with the connector's category. Future setups of the same connector type can reuse the skill file.

## Security

The MCP server runs on localhost by default. For remote access, the server should be placed behind authentication. The MCP protocol supports authentication headers — configure these when exposing the server beyond localhost.

Do not expose the MCP endpoint to the public internet without authentication. The graph operations include write access (create intents, record expressions), and unauthenticated access would allow arbitrary graph mutations.
