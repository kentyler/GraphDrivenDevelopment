# Graph-Driven Development

A set of skill files that teach a frontier LLM to build a graph-driven development system. You download the folder, point your LLM at it, and it builds the system from the instructions.

## What this is

The intent graph is a development system where every piece of work — what needs to exist, what depends on what, what "done" looks like, and what was produced — is represented as a testable node in a dependency graph. It applies TDD at the architecture level: intents have test conditions, expressions satisfy them, and "what to do next" is always "what's red."

The system supports multiple actor types — humans, LLM agents, application users, external forces — all running the same loop through the same graph. Agents are first-class graph entities with scoped jurisdiction, trust-bounded write permissions, and auditable sessions.

## What's in the folder

```
CLAUDE.md                        Entry point — read this first
skills/
  foundations.md                 Why the system is shaped this way
  intent-graph.md                The technical spec — vocabulary, operations, layers 0-7
  agents.md                      Agent definitions — scope, trust, triggers
  graph-completeness.md          The completeness model — red/green, no tension scores
  graph-merge.md                 Cross-graph collaboration
  mcp-server.md                  MCP server — build instructions, tool definitions, connectors
  ui-client.md                   UI client — user-facing surfaces as external MCP clients
  community.md                   Optional — post build reports to GitHub Discussions
```

## Getting started

1. Clone this repo
2. Open it in your LLM tool of choice (Claude Code, Cursor, Windsurf, etc.)
3. Let it read `CLAUDE.md`, which directs it to the skill files
4. It will create a sibling `GDD` directory, set up PostgreSQL, build the schema, and implement all layers including the MCP server
5. User-facing surfaces (natural language intake, application UIs) are built separately as MCP clients — see `skills/ui-client.md`

This repo is the instruction set — the LLM reads from here but builds in separate directories. The backend goes in `GDD`, user-facing UIs go in their own directory (e.g., `GDD-UI`). The skill files describe *what* needs to exist, not *how* to build it. Your LLM makes the implementation choices.

## Requirements

- PostgreSQL (the graph stores all state in PostgreSQL)
- Node.js (the system is built in JavaScript with Express)
- A frontier LLM capable of reading instructions and writing code

## Community feedback

The [Discussions](https://github.com/kentyler/GraphDrivenDevelopment/discussions) page collects build reports from different models and environments. If you run a build, consider posting what worked and where the instructions were unclear. Gap nodes — places where the skill files weren't precise enough — are especially valuable.

See `skills/community.md` for optional automated reporting.

## License

MIT
