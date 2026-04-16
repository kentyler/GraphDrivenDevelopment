# GDD

Graph-Driven Development. The intent graph is the source of truth for this project.

## First run

If the `gdd` database doesn't exist yet, start with `skills/foundations.md` — it describes the stances that shape the system's design. Then read `skills/intent-graph.md` and build what it describes. Follow its prerequisites section to set up PostgreSQL, then implement all layers.

## Ongoing work

Once the system exists, the graph is your entry point — not the skill files.

### Actor tiers

The distinction is not who the actor is — it's whether they need transduction.

**Tier 1 — Application users.** They interact through a built application. Their natural language is transduced via `clientSession` into intents (with tests) or gaps (with notes). They never see the graph directly.

**Tier 2 — Direct users.** Power users with Claude Code or Cowork who work against the graph directly — creating intents, querying projections, recording expressions. No transduction needed. They speak graph.

**Tier 3 — Agents.** Same as Tier 2, except autonomous. They run the intent session loop without a human directing each step, stopping only to create gap nodes when they hit a limit.

Tier 2 and Tier 3 are architecturally identical. A power user employing agents is operating at Tier 3 — they set intent (scope, trust level), the agent executes. The human holds mission, the agent holds execution.

### Defining agents

Agents are first-class graph entities with their own table (`gdd.agents`). An agent definition carries:

- **Scope** — which intents it operates on (a projection, a subgraph, a tag)
- **Trust level** — what it can write back (create intents? only record expressions? only create gaps?)
- **Trigger** — when to activate (manual, event, schedule, continuous)
- **Current session** — reference to whatever session it's running, if any

Defining an agent is the mission assignment. The human creates an agent definition with scope, trust, and trigger — that's the directive. The agent executes within that scope autonomously. Gap nodes created by the agent surface back to whoever defined it.

"Run agent" means: open an intent session with the agent as actor, hand it `renderLLM` output scoped to its jurisdiction, let it execute until it exhausts red intents in scope or creates a gap, close the session. The agent's work is fully auditable — just sessions in the mutation log.

Multiple agents with overlapping scopes create `tensions-with` edges worth surfacing.

### Intent sessions

All work — human-directed, autonomous, or user-driven — happens in intent sessions, organized around a specific intent.

1. Query the graph (`queryIncomplete`) to see what's red
2. Build a projection for the intent you're working on
3. Open an intent session (`createSession` with the target `intent_id`)
4. Do the work — intent changes or expression changes
5. Record expressions, close the session
6. Commit and push — each intent session ends with a git commit and push

`skills/intent-graph.md` — vocabulary, edge types, and operation specs.
`skills/agents.md` — agent definitions: scope, trust levels, activation, the agents table.

## Stack

- **Database**: PostgreSQL — `gdd` schema in `gdd` database
- **Backend**: Node.js/Express (src/server.js)
- **API**: REST endpoints on port 3000

## Conventions

- All graph state lives in the `gdd` schema
- Every mutation happens within a session
- Never hardcode credentials
- Test conditions are mandatory on intents — no test, no intent
