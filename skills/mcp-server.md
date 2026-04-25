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

What's red. Returns intents and gaps with no incoming satisfies edges (excluding expression, decision, and signal nodes). Supports a workable filter to return only red intents whose dependencies are all green.

- **Input**: `{ workable?: boolean }` — when true, returns only red intents whose blocked-by dependencies all have incoming satisfies edges
- **Maps to**: `queryIncomplete`

### query_skills

What capabilities exist. Returns skill directory entries.

- **Input**: `{ category?: string }` — optional category filter
- **Maps to**: `SELECT` on `gdd.skills`

### build_projection

Full context for a given intent — dependencies, test condition, expression nodes, gaps, decisions, supersession chains.

- **Input**: `{ intent_id: string, graph_id?: string }` — optional graph_id scopes the projection to nodes within that graph's memberships
- **Maps to**: `buildProjection` + `renderHuman` or `renderLLM`

### create_intent

Direct graph operation for actors who speak graph. Handles all node types -- intent types require test_condition, gap/decision/signal nodes require notes, expression nodes require artifacts.

- **Input**: `{ name, type, description, test_condition?, test_verification?, blocked_by?: string[], notes?: string, artifacts?: object, throughput?: number }`
- **Maps to**: `createIntent`

### record_expression

Record work done against one or more intents. Creates an expression node and satisfies edges linking it to the specified intents.

- **Input**: `{ intent_ids: string[], artifacts: object, name: string, description?: string }`
- **Maps to**: `recordExpression`

### link_expression

Link an existing expression node to an additional intent it also satisfies.

- **Input**: `{ expression_id: string, intent_id: string }`
- **Maps to**: `linkExpression`

### create_graph

Create a named graph for organizing nodes.

- **Input**: `{ id: string, name: string, owner: string }`
- **Maps to**: `createGraph`

### add_node_to_graph

Add a node to a graph (create a membership).

- **Input**: `{ graph_id: string, node_id: string }`
- **Maps to**: `addNodeToGraph`

### remove_node_from_graph

Remove a node from a graph (delete a membership). The node itself is not deleted.

- **Input**: `{ graph_id: string, node_id: string }`
- **Maps to**: `removeNodeFromGraph`

### query_graph_nodes

List all nodes belonging to a graph.

- **Input**: `{ graph_id: string, type?: string }`
- **Maps to**: `queryGraphNodes`

### node_graphs

List all graphs a node belongs to.

- **Input**: `{ node_id: string }`
- **Maps to**: `nodeGraphs`

### create_gap

Pull the andon cord.

- **Input**: `{ name, notes, blocked_by?: string[] }`
- **Maps to**: `createGap`

### create_decision

Record what was chosen, alternatives considered, and scope governed. Optionally closes one or more gaps.

- **Input**: `{ name: string, description: string, notes: string, closes?: string[] }` — closes is an array of gap IDs; creates `closes` edges from the decision to each gap
- **Maps to**: `createDecision`

### supersede_intent

Replace an old intent with a new one. The old intent remains in the graph as history.

- **Input**: `{ new_intent_id: string, old_intent_id: string }`
- **Maps to**: `supersedeIntent`

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

### Claude Code

Claude Code is likely where the builder works. Connecting it to the GDD MCP server means the builder (and any LLM agent working through Claude Code) can query the graph, record expressions, and pull the andon cord without leaving their coding session.

Add to the project-level settings file (`.claude/settings.json` in the build workspace) or global settings (`~/.claude/settings.json`):

```json
{
  "mcpServers": {
    "gdd": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

This uses Streamable HTTP transport -- Claude Code connects to the running Express server. The GDD server must be running before starting the Claude Code session. If the server is not running, the MCP tools will be unavailable but Claude Code will function normally otherwise.

Project-level settings are preferred -- they keep the GDD connection scoped to the build workspace. Global settings make the graph available in all Claude Code sessions, which is useful if the user works across multiple projects that share the same graph.

Once connected, Claude Code gains all GDD MCP tools as available tool calls. The builder can ask Claude Code to query what's red, build a projection, record an expression, or create a gap -- all within the same session where they're writing code. This closes the loop: the builder writes code in Claude Code, and the graph that tracks that work is accessible from the same environment.

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

Point the tool's MCP connector at `http://localhost:3000/mcp`. The protocol is standard -- any tool that speaks MCP can connect.

## Connector skill files

When a new connector is set up, the LLM should write a skill file capturing the setup steps and any tool-specific details (what works well, what limitations exist, what the user typically does through that surface). Register it in `gdd.skills` with the connector's category. Future setups of the same connector type can reuse the skill file.

## Security

The MCP server runs on localhost by default. For remote access, the server should be placed behind authentication. The MCP protocol supports authentication headers — configure these when exposing the server beyond localhost.

Do not expose the MCP endpoint to the public internet without authentication. The graph operations include write access (create intents, record expressions), and unauthenticated access would allow arbitrary graph mutations.
