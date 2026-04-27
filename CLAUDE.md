# GDD

Graph-Driven Development. The intent graph is the source of truth for this project.

## First run

**Build in a separate directory.** This folder contains the skill files — the instructions. Do not write build output (source code, package.json, node_modules, etc.) here. Create a new sibling directory called `GDD` and build there. This folder should remain read-only reference material.

If the `gdd` database doesn't exist yet, start with `skills/foundations.md` — it describes the stances that shape the system's design. Then read `skills/intent-graph.md` (model/spec) and `skills/intent-graph-layers.md` (layer definitions) and build what they describe. Follow the prerequisites section to set up PostgreSQL, then implement all layers in the `GDD` directory.

After the system is built, ask the user: **"Do you have an API key for an LLM provider (Anthropic, OpenAI, Google)?"** If yes, add it via the `/api/settings/llm` endpoint or the `configure_provider` MCP tool. Multiple providers can be configured; one is set as active. The active provider powers natural language intake, human-to-graph translation, and agent activation. Without an active provider the system is fully functional for actors who work against the graph directly, but natural language surfaces return 501. LLM provider keys are stored in `gdd.llm_providers` and the server resolves the active provider dynamically per request — no restart needed.

Then ask: **"Would you like to participate in the GDD community feedback loop?"** If yes, see `skills/community.md` for setup. This is entirely optional — it enables posting build reports and gap nodes to the project's GitHub Discussions, which helps improve the skill files across different models and environments. It requires a GitHub personal access token with `write:discussion` scope.

## Ongoing work

Once the system exists, the graph is your entry point — not the skill files.

### Actors

Every actor — human, agent, client, or external force — runs the same loop: find what's red, read the projection, work (create nodes and edges, record expressions as expression nodes with satisfies edges), pull the andon cord if stuck, watch the graph turn green. The loop does not vary by actor type. See `skills/foundations.md` for the full account of why.

What varies between actors is two things: **how they enter the graph** and **what they can write**.

How they enter: some actors work against the graph directly — creating intents, querying projections, recording expressions. Others enter through natural language, with the LLM constructing the intent from the ask — inferring name, type, test condition, and expression — and satisfying it immediately. The actor who asks naturally never sees the graph machinery. Every ask still produces a real intent that persists in the graph, accumulating operational memory over time. The LLM provider configuration determines whether natural language entry is available; without it, direct graph access works fully and natural language surfaces return 501.

What they can write: agents are direct graph actors with defined scope (which intents they can see), trust level (what they can write), and trigger (when they activate). A human employing agents sets scope and trust — that is the mission assignment. The agent executes within it. Both are running the same loop; the difference is who initiates each iteration.

### Skill directory

The `gdd.skills` table is the registry of everything the system can do — local skill files, API endpoints, MCP connectors, Office tool capabilities. The LLM consults it before every request to know what capabilities exist and how to reach them. When the LLM writes a new skill file, it registers it here. See `skills/foundations.md` (Full kitting at the constraint) for why this matters.

### Skill file authoring

The LLM writes its own skill files. When it does preparation work for a request — discovers which tables to consult, what domain rules apply, what output format the user expects — it encodes that preparation as a skill file and registers it in `gdd.skills`. This happens on first encounter, not after detecting a pattern. If the preparation recurs, the skill file is already there. If it never recurs, it sits quietly. The LLM is writing instructions for its own future self.

### Composing agents and applications

A micro-app is a set of skill files that together cover a complete operation — preparation through execution. The graph UI allows users to compose these bundles. Assigning a trigger and authorization to a skill file bundle produces an agent. Assigning a UI surface produces an application. The difference is only the interface — an agent has a programmatic trigger, an app has a human-facing UI. A traditional application is an agent designed to be manipulated by human users.

### Execution surfaces

Any tool with an API or MCP connector is both an execution surface (the system targets it to produce output) and an interaction surface (a human reaches the graph through it). The system should expose an MCP server so external tools — Excel, Word, other MCP-capable applications — can connect to the graph. Each connector has its own skill file covering setup and configuration, registered in `gdd.skills`. See `skills/foundations.md` (Execution surfaces) for the full account.

### Defining agents

Agents are first-class graph entities with their own table (`gdd.agents`). An agent definition carries:

- **Scope** — which intents it operates on (a projection, a subgraph, a tag)
- **Trust level** — what it can write back (create intents? only record expressions? only create gaps?)
- **Trigger** — when to activate (manual, event, schedule, continuous)

Defining an agent is the mission assignment. The human creates an agent definition with scope, trust, and trigger — that's the directive. The agent executes within that scope autonomously. Gap nodes created by the agent surface back to whoever defined it.

"Run agent" means: hand the agent `renderLLM` output scoped to its jurisdiction, let it execute until it exhausts red intents in scope or creates a gap. The agent's work is fully auditable through the nodes, edges, and expressions it created.

Multiple agents with overlapping scopes create `tensions-with` edges worth surfacing.

### Working on the graph

Work is creating graph elements — nodes and edges. There is no session container.

1. Query the graph (`queryIncomplete`) to see what's red
2. Build a projection for the intent you're working on
3. Do the work — create nodes and edges (including expression nodes with satisfies edges)
4. Record the expression on the intent you satisfied
5. If the work produced source artifacts (code, schema, configuration), commit and push

`skills/intent-graph.md` — model, vocabulary, edge types, and conventions.
`skills/intent-graph-layers.md` — layer definitions (Layer 0-7 intent JSON blocks).
`skills/agents.md` — agent definitions: scope, trust levels, activation, the agents table.
`skills/mcp-server.md` — MCP server: build instructions, tool definitions, connector setup.
`skills/ui-client.md` — UI client: build the human surfaces as an external MCP client app.
`skills/revaluation.md` — semantic revaluation: primitive DNA, impact detection through primitive resonance.

## Stack

- **Database**: PostgreSQL — `gdd` schema in `gdd` database
- **Backend**: Node.js/Express (src/server.js)
- **API**: REST endpoints on port 3000
- **MCP**: Protocol endpoint at `/mcp` — see `skills/mcp-server.md`
- **Admin surfaces**: Backend-served web dashboard for direct graph actors — dashboard (what's red), intent detail, gap surface. Served as static files from `public/`, calls the REST API. See Layer 5 `ui-admin-surfaces`.
- **User surfaces**: External MCP clients. Natural language intake and any user-facing application — Claude Desktop, Excel, Word, CLI — connect through the MCP server. The backend does not serve user-facing surfaces. See Layer 5 `ui-user-surfaces` and `skills/ui-client.md`.

## Conventions

- All graph state lives in the `gdd` schema
- The graph is write-only — intents are superseded, never removed or modified
- Never hardcode credentials
- Test conditions are mandatory on intents — no test, no intent
- Commit and push only when source files in the build workspace changed. Graph-only mutations and configuration changes do not produce commits.
