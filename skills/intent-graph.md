# Intent Graph

You are building a graph-driven development system. The intent graph is the central data structure -- it represents what needs to exist, what depends on what, what "done" looks like, and what has been expressed (implemented). Every participant in the system -- human, LLM agent, client, external force -- interacts through this graph.

This skill file teaches you the structure of the intent graph and how to populate it. Your first task after learning this structure is to populate the graph with the intents for building the system itself.

## Self-Hosting Principle

This file teaches you to build the intent graph. The intent graph is then what you — and every subsequent actor — use to operate.

This is not incidental. The system is designed so that the same structure that records its own construction is the structure through which all future work happens. There is no separate "build mode" and "use mode." The graph you populate while implementing this system is the graph you query when deciding what to work on next.

This has a specific implication: the skill file you are reading right now is itself a projection of intent. The intents in Layer 1 through Layer 5 below are not a tutorial — they are the actual graph state the system starts from. When you implement them, you are not following instructions; you are expressing intents that already exist in the representation you are building.

The recursion is the point. A system that can only be specified in prose, by humans, for agents to execute, is a system with a permanent translation layer at its center. This system eliminates that layer. The representation is the specification. Any actor that can read the graph can operate the system. Any actor that can operate the system can extend it by adding intents with test conditions.

The recursion bottoms out at the root intent (`gdd-root`). Every self-hosting system has a founding moment that precedes the rules it will subsequently enforce — the schema must exist before sessions can reference intents. The root intent is that ground, named explicitly. See Prerequisites for details.

## Prerequisites

**PostgreSQL** is required. The intent graph stores all state in PostgreSQL.

Before doing anything else, check whether PostgreSQL is installed and running:

```
psql --version
pg_isready
```

If PostgreSQL is not installed, help the user install it:
- **Windows**: Download from https://www.postgresql.org/download/windows/ or use `winget install PostgreSQL.PostgreSQL`
- **macOS**: `brew install postgresql@16 && brew services start postgresql@16`
- **Linux**: `sudo apt install postgresql` or equivalent for the distribution

Once PostgreSQL is running, create the GDD database and schema:

```sql
CREATE DATABASE gdd;
\c gdd
CREATE SCHEMA gdd;
```

All graph tables live in the `gdd` schema within the `gdd` database. Connection parameters should be read from environment variables with these defaults:

| Variable | Default |
|----------|---------|
| `GDD_DB_HOST` | `localhost` |
| `GDD_DB_PORT` | `5432` |
| `GDD_DB_NAME` | `gdd` |
| `GDD_DB_USER` | `postgres` |
| `GDD_DB_PASSWORD` | (prompt user) |

**Never hardcode credentials.** Database passwords must come from environment variables or be prompted at runtime. Never commit passwords to source files.

### The root intent

After creating the schema and tables, insert the root intent — the axiomatic ground that precedes all sessions. Self-hosting systems have a founding moment that precedes the rules the system will subsequently enforce. The root intent is that moment, named explicitly rather than hidden.

```json
{
  "id": "gdd-root",
  "type": "compose",
  "name": "GDD system exists and is operational",
  "description": "The axiomatic ground of the intent graph. This intent exists before any session creates it. All bootstrap sessions reference it. The recursion of self-hosting bottoms out here.",
  "children": ["foundation-tables"]
}
```

Its test condition is structural: the schema exists, the API responds, the graph is queryable. It is inserted by the schema creation script, not produced by the session/mutation mechanism. All bootstrap sessions use `gdd-root` as their `intent_id`, which means the invariant — every session is organized around a specific intent — holds everywhere, including during the system's own construction.

## Build Conventions

### Intent sessions

All work happens in intent sessions — sessions organized around a specific intent. An intent session is not "a period of work"; it is work on a specific intent.

1. Open an intent session (`createSession` with the target `intent_id` and `actor_type`)
2. Do the work — write code, create tables, write tests
3. All graph mutations (new intents, edges, expressions) reference this session_id
4. Record the expression on the intent you satisfied (artifacts = files created/modified)
5. Close the session — this computes the diff of everything you changed
6. Git commit and push — each intent session ends with a commit describing what was expressed

This applies during bootstrap (the system's first use case is tracking its own construction) and during all subsequent work. Every intent session becomes part of the graph's history.

### Project setup

Initialize a git repository and a Node.js project. The system is built in JavaScript with Express. Use any test framework you prefer (Jest, Vitest, etc.).

### Build the API server

This system needs an Express server with REST endpoints, not just library functions. After implementing the core operations, create `src/server.js` with Express routes that expose the operations as API endpoints. The graph should be queryable and mutable over HTTP.

### Test isolation

All test data must use a consistent prefix (e.g., `test-`) for IDs so it can be cleaned up reliably. This applies to **all** ID-generating operations — sessions, intents, edges, expressions. Operations that generate dynamic IDs (like `transduceExternal` which creates `transduction-{timestamp}`) must accept an optional ID parameter in tests so cleanup works.

Cleanup in beforeEach/afterEach must respect FK constraint ordering:

```
1. mutations (references sessions)
2. expressions (references nodes and sessions)
3. edges (references nodes)
4. nodes by session_id (operations like transduceExternal create auto-ID nodes under test sessions)
5. nodes by id prefix
6. sessions
```

The critical issue: some operations create intents with auto-generated IDs (not `test-` prefixed) that reference `test-` prefixed sessions. Cleanup must find these nodes by `session_id LIKE 'test-%'`, not just by `id LIKE 'test-%'`.

### LLM operations: injection, not configuration

Three operations require LLM calls: `translateRepresentation` (human-to-graph direction), `transduceExternal`, and `clientSession`. These accept an `llm` parameter — a function that takes a prompt string and returns a string. The system does not prescribe which LLM or how it's called.

This means these operations are library functions that need an LLM function injected by the caller. The REST API endpoints for these operations require server-level middleware or configuration that provides the LLM function. Without it, these endpoints cannot work — document this clearly in the server setup.

Do not attempt to parse natural language with regex or keyword matching — it produces brittle, incorrect results. The LLM already knows how to classify intents; give it the vocabulary and let it work.

### Transduction reliability

LLM transduction — turning natural language into graph mutations — works well against a small graph but degrades as the graph grows. Maintaining referential integrity across a large context through prompting alone is unreliable.

Two safeguards:

**Transduction operates against a projection, not the full graph.** When `clientSession`, `transduceExternal`, or `translateRepresentation` (human-to-graph) call the LLM, they pass a projection — the relevant subgraph for the current session context — not the entire graph. This keeps the context window bounded and the referential surface small. The LLM only needs to produce valid references within the projection it was given.

**Transduction output is validated before committing.** The LLM produces candidate mutations. A deterministic validator checks them before they touch the graph: all `intent_id` references must exist (or be newly created in the same batch), edge targets must be valid, type vocabulary must match, test conditions must be present on intent types. Unknown IDs are rejected. Ambiguous references become gap nodes rather than being silently resolved. Transduction failures preserve the original natural language input in the gap's notes — nothing is lost, the ambiguity is just surfaced honestly.

The pattern: LLM proposes, validator disposes. The LLM is good at interpretation. It is not reliable at referential integrity over large contexts. Split the work accordingly.

## Core Concepts

An intent graph has four elements:

1. **Intent nodes** — what needs to exist or happen
2. **Edges** — relationships between intents (dependency, composition)
3. **Test conditions** — how you know an intent is satisfied
4. **Expressions** — the concrete artifacts that satisfy an intent (code, schema, configuration)

The graph is not a task list. A task says "do X." An intent says "X needs to exist, it depends on Y and Z, it's satisfied when these conditions hold, and here's what was produced." The difference: an intent carries its own context, its own completion criteria, and its own history.

## Intent Node Structure

Every intent node has these fields:

```json
{
  "id": "string -- unique identifier",
  "type": "string -- from the fixed vocabulary below",
  "name": "string -- human-readable short name",
  "description": "string -- what this intent means and why it matters",
  "status": "potential | active | satisfied",
  "test": {
    "condition": "string -- REQUIRED for all intent types except gap and compose. The verifiable claim: what must be true for this intent to be satisfied. Gap nodes have no test condition (that's what makes them gaps -- the test is not yet articulable). Compose nodes have a structural test: all contains children are satisfied.",
    "verification": "string -- how to check (query, assertion, inspection)"
  },
  "throughput": "number -- optional. Expected revenue or value when this intent is satisfied. Used for throughput accounting: the graph can compute total throughput of satisfying an intent by summing its value plus the value of all downstream intents it unblocks. The constraint (agent scope with most queued red intents) combined with throughput tells you which work generates the most value per unit of constraint.",
  "expression": {
    "artifacts": ["array -- files, tables, endpoints produced when satisfied"],
    "summary": "string -- what was done to satisfy this intent"
  },
  "metadata": {
    "created_by": "string -- who authored this intent (human, agent, transduced)",
    "created_at": "timestamp",
    "session_id": "string -- which session created this intent"
  }
}
```

### Status values and the red/green model

The graph is a test suite. Each intent is a test:

- **Red**: Intent exists, expression does not (or test condition is not satisfied)
- **Green**: Intent exists, expression exists, test passes

"What to do next" = "what's red." The same red-green cycle as TDD, lifted to the intent graph.

Status values map to structural state:

- **potential**: Upstream `blocked-by` dependencies are unsatisfied (structurally not ready -- like a second floor that needs the first floor built)
- **active**: All `blocked-by` dependencies are satisfied. This intent is red -- it needs an expression.
- **satisfied**: Test condition met, expression produced. This intent is green.

Status transitions are derived, not manually set. An intent becomes **active** when all its `blocked-by` dependencies reach **satisfied**. An intent becomes **satisfied** when its test condition passes and an expression is recorded. A `compose` intent is automatically satisfied when all its `contains` children are satisfied — `recomputeStatus` should check this. There is no "suspended" -- intents that are no longer intended are removed from the graph. History lives in the mutations table.

## Intent Types

Fixed vocabulary. Use `gap` for anything that doesn't fit.

### Schema types -- data structures that need to exist

| Type | Meaning | Key fields |
|------|---------|------------|
| `define-table` | A database table needs to exist | `table_name`, `columns` |
| `define-type` | A data type or enum needs to be defined | `type_name`, `values` or `shape` |
| `define-schema` | A JSON schema or structured format | `schema_name`, `shape` |

### Operation types -- functions or behaviors that need to exist

| Type | Meaning | Key fields |
|------|---------|------------|
| `implement-operation` | A function or procedure | `operation_name`, `input`, `output` |
| `implement-endpoint` | An API route | `method`, `path`, `input`, `output` |
| `implement-traversal` | A graph query or navigation operation | `traversal_name`, `start`, `pattern`, `returns` |
| `implement-projection` | A view-construction operation | `projection_name`, `source`, `vantage`, `shape` |
| `implement-mutation` | A graph write operation | `mutation_name`, `target`, `effect` |

### Integration types -- connections between components

| Type | Meaning | Key fields |
|------|---------|------------|
| `integrate` | Two components need to be connected | `source`, `target`, `mechanism` |
| `derive` | A value or structure derived from other state | `derived_name`, `from`, `rule` |
| `translate` | Convert between representations | `from_repr`, `to_repr`, `mechanism` |

### Constraint types -- rules and boundaries

| Type | Meaning | Key fields |
|------|---------|------------|
| `constrain-permission` | An access control rule | `actor_type`, `node_type`, `operations` |
| `constrain-invariant` | A condition that must always hold | `invariant`, `scope` |

### Structural types -- organizing the graph itself

| Type | Meaning | Key fields |
|------|---------|------------|
| `establish-convention` | A pattern or convention for the system | `convention_name`, `applies_to`, `rule` |
| `define-vocabulary` | A set of terms with fixed meanings | `vocabulary_name`, `terms` |
| `compose` | A grouping node that is automatically satisfied when all its `contains` children are satisfied. Does not need a hand-written test condition -- its test is structural. | `children` |

### Gap type

| Type | Meaning | Key fields |
|------|---------|------------|
| `gap` | Needs human decision before proceeding | `name`, `notes` (REQUIRED) |

Gap node structure:

```json
{
  "id": "string -- unique identifier",
  "type": "gap",
  "name": "string -- short description of what is unclear",
  "notes": "string -- REQUIRED when created by any actor. Everything the actor does know: what was encountered, what made the test condition unarticulable, what a human needs to resolve before this can become an intent.",
  "metadata": {
    "created_by": "string",
    "created_at": "timestamp",
    "session_id": "string"
  }
}
```

## Edge Types

Edges connect intent nodes. Every edge has a `type` and a direction (from -> to).

| Edge type | Meaning | Example |
|-----------|---------|---------|
| `blocked-by` | Cannot start until target is satisfied. Traversable in both directions — read forward for "what blocks me", reverse for "what do I unblock". | "implement projection" blocked-by "define graph tables" |
| `contains` | Parent-child composition | A `compose` intent contains its parts |
| `tensions-with` | Two intents that pull in different directions | Performance vs. completeness of a traversal |
| `refines` | A more specific version of a general intent | "implement session projection" refines "implement projection" |

Note: there is no `supersedes` edge type. When an intent is replaced by a new design, the old intent is removed and the new one is created. The mutation log records both operations, preserving full history without cluttering the graph with dead nodes.

## Completeness

The graph does not use tension scores, priority weights, or urgency signals. "What to do next" is determined by a single question: **what's incomplete?**

An intent without an expression is red. An intent with an expression whose test passes is green. The graph is a house -- when you add a room, it's there. When you tear one down, it's gone. There is no planning-state limbo.

### The andon cord

If any actor — human, LLM agent, or client — cannot articulate a test condition, do not create an intent. Create a gap node instead. Record everything you do know in the gap's `notes` field. The gap is not an admission of total ignorance — it is the boundary between what is articulable and what is not, with the articulable part preserved. Gaps surface to humans through the human-legible representation.

Intents are commitments (test defined). Gaps are questions (test not possible yet, but partial knowledge preserved).

### Removing intents

Removal cascades recursively. If intent A is removed, all downstream dependents (intents with `blocked-by` edges pointing to A) are also removed. This is structural — like tearing down a load-bearing wall, the floors above come down. The mutation log records full before-state for each removed node, so any removal is reversible through session history.

Removal is a two-phase operation. Phase one: compute the full cascade — every node that would be removed, with names and counts. Phase two: execute only after the actor has seen the impact and confirmed. No silent cascades. The structural principle holds; the execution gets a safety layer.

For agents, cascade removal has a threshold. If the computed cascade exceeds a configurable number of nodes, the agent does not execute the removal. Instead it creates a gap node: "removing X would cascade to Y, Z, W — human decision required." This is the andon cord applied to structural operations. The agent surfaces the impact rather than proceeding.

## Populating the Graph

When populating a new intent graph for a project:

1. **Start with what must exist first.** Schema, core types, foundational operations. These have no `blocked-by` edges -- they're the roots.
2. **Work outward through dependencies.** Each intent should reference what it's blocked by. The dependency chain should be explicit, not implied.
3. **Write test conditions concretely.** "The table exists and has the right columns" is better than "schema is done." "The endpoint returns a projection given a session context" is better than "projections work."
4. **Leave expressions empty.** Expressions are filled when the intent is satisfied -- when code is written, tables are created, endpoints are tested.
5. **Use gap for genuine decisions.** If you don't know which approach to take, create a gap intent with the question and options. Don't guess -- surface the decision.
6. **Don't over-decompose.** An intent should be large enough to be meaningful and small enough to have a clear test condition. "Build the whole system" is too large. "Add a column" is too small unless it's genuinely a separate concern.

## Initial Population: The Dual Graph System

The following intents describe what the dual graph system needs. This is the project's own intent graph -- the system's first use of itself.

### Layer 0: Foundation -- Schema and Core Types

```json
[
  {
    "id": "foundation-tables",
    "type": "compose",
    "name": "Graph foundation tables",
    "description": "The database tables that store the global intent graph.",
    "children": ["table-nodes", "table-edges", "table-sessions", "table-expressions", "table-mutations", "table-agents"]
  },
  {
    "id": "table-nodes",
    "type": "define-table",
    "name": "Intent nodes table",
    "description": "Stores all nodes in the global graph -- intents, compose nodes, and gap nodes. Each row has type, status, test condition, and metadata. test_condition is nullable: required for intent types (the verifiable claim), null for gap nodes (test not yet articulable), and structural for compose nodes ('all contains children are satisfied').",
    "table_name": "gdd.nodes",
    "test": {
      "condition": "Table exists with columns: id, type, name, description, status, test_condition (nullable), test_verification, throughput (numeric, nullable), expression_artifacts, expression_summary, created_by, created_at, session_id. Gap nodes have null test_condition. All other non-compose types require a non-null test_condition.",
      "verification": "SELECT * FROM information_schema.columns WHERE table_schema='gdd' AND table_name='nodes'"
    }
  },
  {
    "id": "table-edges",
    "type": "define-table",
    "name": "Intent edges table",
    "description": "Stores directed edges between intent nodes. Each edge has a type (blocked-by, contains, tensions-with, refines).",
    "table_name": "gdd.edges",
    "test": {
      "condition": "Table exists with columns: id, from_node, to_node, edge_type, metadata",
      "verification": "SELECT * FROM information_schema.columns WHERE table_schema='gdd' AND table_name='edges'"
    }
  },
  {
    "id": "table-sessions",
    "type": "define-table",
    "name": "Session graphs table",
    "description": "Stores intent sessions. Each session is organized around a specific intent and has an actor. The intent_id links the session to the intent being worked on.",
    "table_name": "gdd.sessions",
    "test": {
      "condition": "Table exists with columns: id, intent_id, actor_type, actor_id, status, started_at, ended_at, parent_session_id. intent_id FK to gdd.nodes.",
      "verification": "SELECT * FROM information_schema.columns WHERE table_schema='gdd' AND table_name='sessions'"
    }
  },
  {
    "id": "table-expressions",
    "type": "define-table",
    "name": "Expressions table",
    "description": "Stores the concrete output of satisfied intents and completed sessions. An expression records what was produced, by which session, for which intent.",
    "table_name": "gdd.expressions",
    "test": {
      "condition": "Table exists with columns: id, intent_id, session_id, artifacts, summary, created_at, diff",
      "verification": "SELECT * FROM information_schema.columns WHERE table_schema='gdd' AND table_name='expressions'"
    }
  },
  {
    "id": "table-mutations",
    "type": "define-table",
    "name": "Mutations tracking table",
    "description": "Tracks every graph mutation within a session. Each row records the action (node_created, node_modified, edge_created, expression_recorded), the target, and before/after state. This is the raw material for computing session diffs and enabling versioning.",
    "table_name": "gdd.mutations",
    "test": {
      "condition": "Table exists with columns: id, session_id, action, target_type, target_id, before_state, after_state, created_at. session_id has a foreign key to gdd.sessions. Index on session_id for fast diff computation.",
      "verification": "SELECT * FROM information_schema.columns WHERE table_schema='gdd' AND table_name='mutations'"
    }
  },
  {
    "id": "table-agents",
    "type": "define-table",
    "name": "Agents table",
    "description": "Stores agent definitions -- named, scoped, trust-bounded autonomous actors. Each agent has a scope (which intents it operates on), a trust level (what it can write back), and a status. See skills/agents.md for full specification.",
    "table_name": "gdd.agents",
    "test": {
      "condition": "Table exists with columns: id, name, scope (JSONB), trust_level, trigger (JSONB, default '{\"type\":\"manual\"}'), status, current_session (FK to gdd.sessions, nullable), created_by, created_at, session_id",
      "verification": "SELECT * FROM information_schema.columns WHERE table_schema='gdd' AND table_name='agents'"
    }
  },
  {
    "id": "type-intent-status",
    "type": "define-type",
    "name": "Intent status enum",
    "description": "The three status values for intent nodes: potential (blocked), active (red -- needs expression), satisfied (green -- test passes).",
    "type_name": "gdd.intent_status",
    "values": ["potential", "active", "satisfied"],
    "test": {
      "condition": "Enum type exists in database",
      "verification": "SELECT enumlabel FROM pg_enum WHERE enumtypid = 'gdd.intent_status'::regtype"
    }
  },
  {
    "id": "type-edge-type",
    "type": "define-type",
    "name": "Edge type enum",
    "description": "The four edge types: blocked-by, contains, tensions-with, refines. No 'enables' — blocked-by is traversed in both directions.",
    "type_name": "gdd.edge_type",
    "values": ["blocked-by", "contains", "tensions-with", "refines"],
    "test": {
      "condition": "Enum type exists in database",
      "verification": "SELECT enumlabel FROM pg_enum WHERE enumtypid = 'gdd.edge_type'::regtype"
    }
  },
  {
    "id": "type-session-status",
    "type": "define-type",
    "name": "Session status enum",
    "description": "The two status values for sessions: open (accepting mutations) and closed (diff computed, no further mutations).",
    "type_name": "gdd.session_status",
    "values": ["open", "closed"],
    "test": {
      "condition": "Enum type exists in database",
      "verification": "SELECT enumlabel FROM pg_enum WHERE enumtypid = 'gdd.session_status'::regtype"
    }
  },
  {
    "id": "type-actor-type",
    "type": "define-type",
    "name": "Actor type enum",
    "description": "Who can create sessions: human, agent, client, external.",
    "type_name": "gdd.actor_type",
    "values": ["human", "agent", "client", "external"],
    "test": {
      "condition": "Enum type exists in database",
      "verification": "SELECT enumlabel FROM pg_enum WHERE enumtypid = 'gdd.actor_type'::regtype"
    }
  },
  {
    "id": "type-agent-trust",
    "type": "define-type",
    "name": "Agent trust level enum",
    "description": "What an agent can write back: full (create intents, record expressions, create gaps, create edges), express-only (record expressions and create gaps), gaps-only (only create gaps -- a scout).",
    "type_name": "gdd.agent_trust",
    "values": ["full", "express-only", "gaps-only"],
    "test": {
      "condition": "Enum type exists in database",
      "verification": "SELECT enumlabel FROM pg_enum WHERE enumtypid = 'gdd.agent_trust'::regtype"
    }
  },
  {
    "id": "type-agent-status",
    "type": "define-type",
    "name": "Agent status enum",
    "description": "Agent lifecycle: defined (exists but not running), active (currently executing with a session), paused (stopped -- gap encountered, scope exhausted, or manual pause).",
    "type_name": "gdd.agent_status",
    "values": ["defined", "active", "paused"],
    "test": {
      "condition": "Enum type exists in database",
      "verification": "SELECT enumlabel FROM pg_enum WHERE enumtypid = 'gdd.agent_status'::regtype"
    }
  }
]
```

### Layer 1: Core Operations -- CRUD and Basic Traversal

These intents are all `blocked-by` the foundation tables.

```json
[
  {
    "id": "op-create-intent",
    "type": "implement-operation",
    "name": "Create intent node",
    "description": "Insert a new node into the global graph. Validates type against the fixed vocabulary. For intent types: test_condition is required -- reject creation if missing or empty. For gap nodes: test_condition must be null, notes field is required. For compose nodes: test_condition is structural (all children satisfied). Accepts an optional blocked_by array of intent IDs. If provided, the node is inserted first, then blocked-by edges are created, then status is computed. Status is 'active' (red) if no blocked-by edges exist or all targets are satisfied, otherwise 'potential'.",
    "operation_name": "createIntent",
    "input": "Node fields (type, name, description, test, optional blocked_by[]). test.condition is REQUIRED for intent types, null for gaps, structural for compose.",
    "output": "Created node with id and computed status",
    "blocked_by": ["foundation-tables"],
    "test": {
      "condition": "Can create nodes and retrieve them by id. Rejects intent-type creation if test_condition is null/empty. Accepts gap creation with null test_condition and required notes. Accepts compose creation with structural test. Status defaults to 'active' unless blocked-by edges exist (then 'potential').",
      "verification": "Integration test: create intent node, gap node, compose node. Verify rejection when intent type has no test_condition. Verify gap requires notes."
    }
  },
  {
    "id": "op-create-edge",
    "type": "implement-operation",
    "name": "Create edge",
    "description": "Insert a directed edge between two intent nodes. Validates both nodes exist. If edge is 'blocked-by', recomputes status of the source node.",
    "operation_name": "createEdge",
    "input": "from_node, to_node, edge_type",
    "output": "Created edge, updated node statuses",
    "blocked_by": ["foundation-tables"],
    "test": {
      "condition": "Can create edges. Adding a 'blocked-by' edge to an 'active' node changes it to 'potential'. Removing the edge (or satisfying the dependency) changes it back.",
      "verification": "Integration test: create two nodes, add blocked-by edge, verify status transitions"
    }
  },
  {
    "id": "op-create-session",
    "type": "implement-operation",
    "name": "Create session",
    "description": "Start an intent session -- a session organized around a specific intent. Records the target intent, actor type, and actor id. A session is the context for all graph mutations -- every change to the global graph happens within an intent session.",
    "operation_name": "createSession",
    "input": "intent_id (the intent this session is about), actor_type, actor_id",
    "output": "Session with id, intent_id, and started_at",
    "blocked_by": ["foundation-tables"],
    "test": {
      "condition": "Can create a session with an intent_id and retrieve it. Session status starts as 'open'. The intent_id links the session to the intent being worked on.",
      "verification": "Integration test: create session with intent_id, query by id, verify intent_id is stored"
    }
  },
  {
    "id": "op-record-expression",
    "type": "implement-operation",
    "name": "Record expression",
    "description": "Record that an intent has been satisfied. Stores the artifacts produced and a summary. Updates intent status to 'satisfied'. Linked to the session that produced it. Captures the global graph diff.",
    "operation_name": "recordExpression",
    "input": "intent_id, session_id, artifacts, summary",
    "output": "Expression record, updated intent status",
    "blocked_by": ["op-create-intent", "op-create-session"],
    "test": {
      "condition": "Recording an expression sets intent status to 'satisfied'. Downstream intents that were 'potential' become 'active' if all their blocked-by dependencies are now satisfied.",
      "verification": "Integration test: create chain A blocks B blocks C. Satisfy A, verify B becomes active. Satisfy B, verify C becomes active."
    }
  },
  {
    "id": "op-traverse-dependencies",
    "type": "implement-traversal",
    "name": "Traverse dependency chain",
    "description": "Given an intent node, traverse blocked-by edges in both directions: forward to find all upstream dependencies (what must be done first), reverse to find all downstream dependents (what this unlocks). Returns the subgraph, not a flat list.",
    "traversal_name": "traverseDependencies",
    "start": "Any intent node",
    "pattern": "Follow blocked-by edges forward (upstream deps) and reverse (downstream dependents)",
    "returns": "Subgraph of dependency chain with status at each node",
    "blocked_by": ["op-create-intent", "op-create-edge"],
    "test": {
      "condition": "Given a chain A -> B -> C -> D, traversing from C returns A,B upstream and D downstream with correct statuses.",
      "verification": "Integration test with a known chain"
    }
  },
  {
    "id": "op-query-incomplete",
    "type": "implement-traversal",
    "name": "Query incomplete intents",
    "description": "Return all intent nodes that are red: status is 'active' (dependencies satisfied but no expression yet). This is the primary entry point for 'what should I work on next?' Ordering: if any red intents have throughput values, order by total downstream throughput (the intent's own throughput plus the throughput of all intents it transitively unblocks). This answers 'which work generates the most value?' across competing projects. If no throughput values exist, fall back to ordering by downstream dependent count.",
    "traversal_name": "queryIncomplete",
    "start": "Global graph",
    "pattern": "Filter by status='active' (red intents), order by total downstream throughput desc (with downstream dependent count as fallback)",
    "returns": "Array of red intent nodes with their downstream dependent counts and total downstream throughput",
    "blocked_by": ["op-create-intent", "op-create-edge"],
    "test": {
      "condition": "Returns only active (red) intents. Does not return potential (blocked) or satisfied (green) intents. When throughput values exist: intent A (throughput 100, unblocks B with throughput 200) ranks above intent C (throughput 250, unblocks nothing) because A's total is 300. When no throughput values exist: intents blocking more downstream work appear first.",
      "verification": "Integration test: create mix of potential/active/satisfied intents, verify only active returned. Create chain where A (throughput 10) blocks B (throughput 50) and C (throughput 30), verify A's total downstream throughput is 90 and it ranks accordingly."
    }
  },
  {
    "id": "op-remove-intent",
    "type": "implement-operation",
    "name": "Remove intent",
    "description": "Two-phase removal. Phase one: compute the full cascade -- every downstream dependent that would be removed via blocked-by edges, with names and counts. Return this impact assessment without executing. Phase two: execute the removal only after the actor confirms. The mutation log records full before-state for every removed node. For agents: if the cascade exceeds a configurable threshold, do not execute -- create a gap node instead, surfacing the impact for human decision.",
    "operation_name": "removeIntent",
    "input": "intent_id, session_id, confirm (boolean -- phase one returns impact, phase two with confirm=true executes)",
    "output": "Phase one: cascade impact (list of nodes that would be removed, with names and dependency context). Phase two: list of all removed nodes, each with before-state.",
    "blocked_by": ["op-create-intent", "op-create-edge"],
    "test": {
      "condition": "Phase one: computing cascade for intent A in chain A->B->C returns [A, B, C] without removing anything. Phase two with confirm: executes removal, cleans up edges, records before-state. Agent removal exceeding threshold creates a gap node instead of executing. Leaf node removal cascades to nothing.",
      "verification": "Integration test: compute cascade without confirm (verify no deletion), then confirm (verify deletion). Test agent threshold triggers gap creation."
    }
  },
  {
    "id": "op-recompute-status",
    "type": "implement-operation",
    "name": "Recompute intent status",
    "description": "Derive the correct status for an intent based on structural state. An intent is 'potential' if any blocked-by dependency is unsatisfied, 'active' if all dependencies are satisfied but no expression exists, 'satisfied' if test passes and expression is recorded. A compose node is automatically 'satisfied' when all its contains children are satisfied. Called after any operation that changes graph structure: recordExpression, createEdge, removeIntent.",
    "operation_name": "recomputeStatus",
    "input": "intent_id",
    "output": "Updated status for the intent and any downstream intents whose status changed as a result",
    "blocked_by": ["op-create-intent", "op-create-edge"],
    "test": {
      "condition": "After satisfying all blocked-by deps of intent X, recomputeStatus changes X from 'potential' to 'active'. After recording an expression for X, recomputeStatus changes X to 'satisfied' and cascades to downstream intents. A compose node with all children satisfied is automatically set to 'satisfied'.",
      "verification": "Integration test: create chain with compose node, satisfy children one by one, verify compose auto-satisfies when last child is green."
    }
  }
]
```

### Layer 2: Projection -- The Read-as-View Mechanism

These intents are blocked by Layer 1 operations.

```json
[
  {
    "id": "projection-mechanism",
    "type": "compose",
    "name": "Projection mechanism",
    "description": "The ability to construct a situated view of the global graph from a specific vantage point. A projection is ephemeral -- built at read time, not stored. It shows the graph as seen from a particular position: what's relevant, what's red, what's green, what's adjacent.",
    "children": ["op-build-projection", "op-session-projection", "op-intersect-graphs"]
  },
  {
    "id": "op-build-projection",
    "type": "implement-projection",
    "name": "Build projection from intent",
    "description": "Given an intent node as vantage point, construct a projection: the intent itself, its dependency chain (up and down), red/green status on each node, test conditions, related sessions. The projection is a subgraph with all context needed to understand and act on this intent.",
    "projection_name": "buildProjection",
    "source": "Global intent graph",
    "vantage": "A single intent node",
    "shape": "Subgraph centered on the vantage intent, with dependency chain, red/green status, test conditions, and session references",
    "blocked_by": ["op-traverse-dependencies"],
    "test": {
      "condition": "Given intent C in a chain A->B->C->D, projection from C includes: C's full node data, A and B as upstream deps with their statuses, D as downstream dependent, red/green state on each, any sessions that reference C.",
      "verification": "Integration test: build known graph, project from a middle node, verify subgraph shape"
    }
  },
  {
    "id": "op-session-projection",
    "type": "implement-projection",
    "name": "Build projection from session",
    "description": "Given a session, construct a projection of the global graph filtered by what the session has touched. Every intent referenced, created, or modified during this session is included, along with their dependency contexts. This is the session's view of the world.",
    "projection_name": "sessionProjection",
    "source": "Global intent graph + session graph",
    "vantage": "A session",
    "shape": "All intents touched by this session, with their dependency chains and red/green status",
    "blocked_by": ["op-build-projection", "op-create-session"],
    "test": {
      "condition": "A session that created intents A and B and modified intent C produces a projection containing A, B, C and their dependency contexts.",
      "verification": "Integration test: run a session with known mutations, verify projection"
    }
  },
  {
    "id": "op-intersect-graphs",
    "type": "implement-projection",
    "name": "Intersect session graph with global graph",
    "description": "Given the transient structure of a conversation (topics, connections, questions) and the persistent global graph, produce the intersection: the part of the global graph that corresponds structurally to what the conversation is about. This is the core read-as-view operation.",
    "projection_name": "intersectGraphs",
    "source": "Session graph + global graph",
    "vantage": "Current conversation structure",
    "shape": "Global graph nodes and edges that match the session graph's topology",
    "blocked_by": ["op-session-projection"],
    "test": {
      "condition": "A session discussing intents X and Y and their relationship produces a projection that includes X, Y, the edge between them, and their immediate neighborhoods in the global graph.",
      "verification": "Integration test: create session with known structure, verify intersection matches expected subgraph"
    }
  }
]
```

### Layer 3: Session Lifecycle

```json
[
  {
    "id": "session-lifecycle",
    "type": "compose",
    "name": "Session lifecycle",
    "description": "Sessions are created, accumulate mutations, and close. On close, their expression (the set of global graph changes) is recorded. The session graph persists as history.",
    "children": ["op-close-session", "op-session-diff", "op-session-history"]
  },
  {
    "id": "op-close-session",
    "type": "implement-operation",
    "name": "Close session",
    "description": "End a session. Computes the global graph diff (all mutations made during this session). Records the diff as the session's expression. Session status becomes 'closed'. The session graph is retained as history.",
    "operation_name": "closeSession",
    "input": "session_id",
    "output": "Session with expression (diff, artifacts, summary)",
    "blocked_by": ["op-create-session", "op-record-expression"],
    "test": {
      "condition": "Closing a session that created 2 intents and satisfied 1 produces a diff showing those 3 mutations. Session status is 'closed'. Session remains queryable.",
      "verification": "Integration test: create session, make mutations, close, verify diff"
    }
  },
  {
    "id": "op-session-diff",
    "type": "implement-operation",
    "name": "Compute session diff",
    "description": "Given a session, compute the set of global graph mutations it produced: nodes created, nodes modified (with before/after), edges created/removed, expressions recorded. This is the materializable diff that enables versioning.",
    "operation_name": "sessionDiff",
    "input": "session_id",
    "output": "Structured diff of all global graph changes",
    "blocked_by": ["op-close-session"],
    "test": {
      "condition": "Diff accurately captures all mutations. Can reconstruct prior graph state by reversing the diff.",
      "verification": "Integration test: snapshot graph, run session, compute diff, apply reverse diff, verify graph matches snapshot"
    }
  },
  {
    "id": "op-session-history",
    "type": "implement-traversal",
    "name": "Query session history",
    "description": "Query the log of sessions. Filter by actor, time range, intents touched. Each result includes the session's purpose, mutations, and expression. This is the queryable graph-of-graphs.",
    "traversal_name": "queryHistory",
    "start": "Session log",
    "pattern": "Filter by actor/time/intent, ordered by time",
    "returns": "Array of sessions with their diffs and expressions",
    "blocked_by": ["op-close-session"],
    "test": {
      "condition": "Can query 'all sessions by agent X that touched intent Y'. Returns sessions with full context.",
      "verification": "Integration test: create multiple sessions with different actors and targets, verify filtered queries"
    }
  }
]
```

### Layer 4: Dual Representation

```json
[
  {
    "id": "dual-repr",
    "type": "compose",
    "name": "Dual representation",
    "description": "Both the global graph and session graphs have two representations: LLM-legible (dense, relational, full structure) and human-legible (summary, narrative, status). The LLM translates between them.",
    "children": ["op-render-human", "op-render-llm", "op-translate-repr"]
  },
  {
    "id": "op-render-human",
    "type": "translate",
    "name": "Render human-legible view",
    "description": "Given a projection (a subgraph), produce a human-readable summary: what the intents are about, what's green (done), what's red (needs work), what's blocked (potential), key decisions made. Narrative form, not graph structure.",
    "from_repr": "Projection (graph structure)",
    "to_repr": "Human-readable summary (markdown or structured text)",
    "mechanism": "Deterministic rendering. The projection already contains structured data -- group intents by status (green/red/blocked), format as markdown. No LLM needed for the base rendering. An LLM layer can be added on top for narrative polish, but the base is a deterministic formatter.",
    "blocked_by": ["projection-mechanism"],
    "test": {
      "condition": "A projection with 5 intents (2 satisfied, 2 active, 1 potential) produces a summary that a non-technical reader can understand: what's done, what's in progress, what's next, what's blocked.",
      "verification": "Generate summary from known projection, human review for clarity"
    }
  },
  {
    "id": "op-render-llm",
    "type": "translate",
    "name": "Render LLM-legible view",
    "description": "Given a projection, produce a dense structured representation optimized for LLM consumption: full node data, edge types, red/green status, test conditions, dependency chains. This replaces the system prompt -- the LLM reads this to understand its situation.",
    "from_repr": "Projection (graph structure)",
    "to_repr": "Structured JSON with full relational detail",
    "mechanism": "Direct serialization of graph structure with computed fields (status, completeness)",
    "blocked_by": ["projection-mechanism"],
    "test": {
      "condition": "LLM-legible rendering includes all node fields, all edges, red/green status, test conditions. An LLM reading this output can determine what to work on next without any additional context.",
      "verification": "Feed rendering to an LLM, ask it to identify the highest-priority work, verify it selects correctly"
    }
  },
  {
    "id": "op-translate-repr",
    "type": "implement-operation",
    "name": "Translate between representations",
    "description": "Bidirectional translation between representations. The two directions have fundamentally different implementations: **human-to-graph** (natural language to intent nodes/edges) is an LLM operation -- accepts an `llm` function parameter, operates against a projection (not the full graph), and produces candidate mutations that are validated for referential integrity before committing. Transduction failures become gaps preserving the original input. Do NOT attempt regex or keyword parsing. **graph-to-human** (mutations to change descriptions) is deterministic -- the input is already structured, so a switch over mutation types produces readable text. No LLM needed.",
    "operation_name": "translateRepresentation",
    "input": "Content in one representation + direction (human-to-graph or graph-to-human). human-to-graph requires an `llm` function parameter.",
    "output": "Content in the other representation",
    "blocked_by": ["op-render-human", "op-render-llm"],
    "test": {
      "condition": "A natural language requirement ('we need users to be able to log in') produces intent nodes with appropriate type, test conditions, and dependencies. A graph mutation ('added blocked-by edge from X to Y') produces a human-readable description ('X now depends on Y being completed first').",
      "verification": "Round-trip test: NL -> graph -> NL, verify semantic preservation"
    }
  }
]
```

### Layer 5: Actor Integration

```json
[
  {
    "id": "actor-integration",
    "type": "compose",
    "name": "Actor integration",
    "description": "All actor types — application users, external forces, and autonomous agents — enter the graph through sessions. Tier 1 actors (application users) are transduced via clientSession. External forces are transduced via transduceExternal. Tier 2/3 actors (direct users, agents) work against the graph directly. Agents are first-class graph entities with scope, trust level, and auditable sessions.",
    "children": ["op-transduce-external", "op-client-session", "op-define-agent", "op-activate-agent", "op-query-agents"]
  },
  {
    "id": "op-transduce-external",
    "type": "implement-operation",
    "name": "Transduce external force",
    "description": "Given an external event (regulatory change, system failure, market signal), create a transduction session that interprets the event into graph mutations via LLM call. The LLM operates against a projection (not the full graph) and produces candidate mutations. A deterministic validator checks referential integrity before committing -- unknown IDs are rejected, ambiguous references become gaps preserving the original input. If the event's impact cannot be articulated as testable intents, create gap nodes. The session records the interpretation so it can be audited or revised.",
    "operation_name": "transduceExternal",
    "input": "External event description, interpreter (human or agent id)",
    "output": "Session with mutations representing the event's impact on the graph",
    "blocked_by": ["session-lifecycle"],
    "test": {
      "condition": "An external event 'new data privacy regulation' produces a transduction session with actor_type='external', creates new intents with test conditions on affected areas, and the session diff shows exactly what changed and why.",
      "verification": "Integration test: simulate external event, verify session and mutations"
    }
  },
  {
    "id": "op-client-session",
    "type": "implement-operation",
    "name": "Client session",
    "description": "A client conversation is a session with actor_type='client'. The client's natural language input is transduced into graph operations via LLM call (not regex parsing), operating against a projection of the relevant subgraph. Candidate mutations are validated for referential integrity before committing -- transduction failures become gaps preserving the original input. The LLM routes each piece of client input: if the client can articulate what 'done' looks like, create an intent with a test condition. If not, create a gap node. Any actor that can state an intent can state what done looks like. If they can't, they have a question, not an intent.",
    "operation_name": "clientSession",
    "input": "Client conversation content, client id",
    "output": "Session with client mutations (intents with tests, or gaps)",
    "blocked_by": ["session-lifecycle", "op-translate-repr"],
    "test": {
      "condition": "A client saying 'users need to log in with email' creates an intent node with a test condition. A client saying 'it needs to be faster' creates a gap node (no testable condition). The session records the full conversation for audit.",
      "verification": "Integration test: simulate client input with clear and vague requirements, verify intent vs gap routing"
    }
  },
  {
    "id": "op-define-agent",
    "type": "implement-operation",
    "name": "Define agent",
    "description": "Create an agent definition as a first-class graph entity. An agent has a scope (which intents it operates on -- a projection, subgraph, or tag), a trust level (what it can write back), a trigger (when to activate -- manual, event, schedule, or continuous), and an llm function for operations requiring LLM calls. Defining an agent is the mission assignment -- the human sets scope, trust, and trigger; the agent executes within that scope autonomously. See skills/agents.md for full specification.",
    "operation_name": "defineAgent",
    "input": "agent_id, scope (projection spec or intent_ids), trust_level (full | express-only | gaps-only), trigger (manual | event | schedule | continuous, defaults to manual), llm function",
    "output": "Agent node stored in the graph with scope and trust metadata",
    "blocked_by": ["session-lifecycle", "projection-mechanism"],
    "test": {
      "condition": "Can create an agent definition with scope and trust level. Agent node is queryable. Agent without a running session is inspectable. Multiple agents with overlapping scopes create tensions-with edges.",
      "verification": "Integration test: define agent with scope of 3 intents, verify agent node exists with correct metadata"
    }
  },
  {
    "id": "op-activate-agent",
    "type": "implement-operation",
    "name": "Activate agent",
    "description": "Start an agent running against its scoped jurisdiction. Opens an intent session with the agent as actor, provides renderLLM output scoped to the agent's intents, and lets it execute the standard loop: queryIncomplete (within scope) -> project -> execute -> record expression -> loop. The agent stops when it exhausts red intents in scope or creates a gap node. On stop, the session closes. All work is auditable through the session's mutations.",
    "operation_name": "activateAgent",
    "input": "agent_id",
    "output": "Running session, or completed session with expression (if agent finished all work in scope)",
    "blocked_by": ["op-define-agent"],
    "test": {
      "condition": "Activating an agent with 2 red intents in scope produces a session where the agent works on both intents. Agent stops when scope is all green or a gap is created. Session diff shows all mutations. Agent cannot mutate intents outside its scope. Agent cannot exceed its trust level (e.g., gaps-only agent cannot record expressions).",
      "verification": "Integration test: define agent with scoped intents, activate, verify it works within scope and trust boundaries"
    }
  },
  {
    "id": "op-query-agents",
    "type": "implement-operation",
    "name": "Query agents",
    "description": "List agent definitions with their current state: status, scope, current session (if active), and gap counts within their scope. Filterable by status and by scope overlap with a specific intent. See skills/agents.md for full specification.",
    "operation_name": "queryAgents",
    "input": "Optional filters: status, scope overlap with intent_id",
    "output": "Array of agent definitions with current state",
    "blocked_by": ["op-define-agent"],
    "test": {
      "condition": "Can list all agents. Can filter by status (e.g., only active agents). Can filter by scope overlap (e.g., agents whose scope includes intent X). Returns gap counts within each agent's scope.",
      "verification": "Integration test: define multiple agents with different statuses and scopes, verify filters work correctly"
    }
  }
]
```

### Resolved Decisions

These were originally gaps, now resolved:

**Session graph construction: Explicit.** LLMs emit graph operations (createIntent, createEdge, gap) as primary output. There is no observer/derivation layer. Derivation contradicts the completeness model — it introduces a lag between conversation and graph state. The session *is* the exploration context; graph operations *are* the commits.

**Intent removal cascade: Recursive.** When an intent is removed, all downstream dependents (intents with `blocked-by` edges pointing to it) are recursively removed. The house metaphor demands it — floors above a removed wall come down. The mutation log records full before-state for every removed node, so removal is reversible through history.

## Edge Summary for Initial Graph

These edges connect the intents above:

```
table-nodes, table-edges, table-sessions, table-expressions, table-mutations, table-agents  ->  (contained by)  ->  foundation-tables
op-create-intent, op-create-edge, op-create-session           ->  (blocked-by)    ->  foundation-tables
op-record-expression                                          ->  (blocked-by)    ->  op-create-intent, op-create-session
op-traverse-dependencies                                      ->  (blocked-by)    ->  op-create-intent, op-create-edge
op-query-incomplete                                           ->  (blocked-by)    ->  op-create-intent, op-create-edge
op-remove-intent                                              ->  (blocked-by)    ->  op-create-intent, op-create-edge
op-recompute-status                                           ->  (blocked-by)    ->  op-create-intent, op-create-edge
op-build-projection                                           ->  (blocked-by)    ->  op-traverse-dependencies
op-session-projection                                         ->  (blocked-by)    ->  op-build-projection, op-create-session
op-intersect-graphs                                           ->  (blocked-by)    ->  op-session-projection
op-close-session                                              ->  (blocked-by)    ->  op-create-session, op-record-expression
op-session-diff                                               ->  (blocked-by)    ->  op-close-session
op-session-history                                            ->  (blocked-by)    ->  op-close-session
op-render-human, op-render-llm                                ->  (blocked-by)    ->  projection-mechanism
op-translate-repr                                             ->  (blocked-by)    ->  op-render-human, op-render-llm
op-transduce-external                                         ->  (blocked-by)    ->  session-lifecycle
op-client-session                                             ->  (blocked-by)    ->  session-lifecycle, op-translate-repr
op-define-agent                                               ->  (blocked-by)    ->  session-lifecycle, projection-mechanism
op-activate-agent                                             ->  (blocked-by)    ->  op-define-agent
op-query-agents                                               ->  (blocked-by)    ->  op-define-agent
```

## Working With This Graph

Any actor — human, LLM agent, client, or external force — follows the same protocol. The loop is the loop.

1. **Find what's red.** Run `queryIncomplete` — it returns all intents whose dependencies are satisfied but have no expression yet. These are the red intents. Start with the one that unblocks the most downstream work.

2. **Read the projection.** Before working on an intent, build its projection. This gives you the full context: what it depends on, what it enables, what its test condition requires. For an LLM actor, `renderLLM` produces the dense structured form that makes this context directly navigable.

3. **Work within an intent session.** Every mutation to the global graph happens within an intent session — a session tied to the specific intent you're working on. Open a session with the intent_id and your actor type, do the work, record the expression, close the session, commit and push.

4. **Pull the andon cord.** If you encounter a decision you can't make, or you can't articulate a test condition, create a gap node rather than guessing. Record everything you do know in the gap's `notes` — the gap is not admission of ignorance, it is the boundary between what is articulable and what is not, with the articulable part preserved. Gaps surface to humans through the human-legible representation.

5. **Watch the graph turn green.** When you satisfy an intent, downstream intents that were blocked may become active (red). The graph structure cascades — no manual updates required.

## Related Skills

- `foundations.md` -- Read first. The philosophical stances that shape every design choice in this system
- `agents.md` -- Agent definitions: scope, trust levels, activation, the agents table
- `graph-completeness.md` -- The completeness model: red/green, mandatory tests, andon cord, no tension scores
- `graph-merge.md` -- Cross-graph collaboration: merge projections, negotiation sessions, organizational patterns
