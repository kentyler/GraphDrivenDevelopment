# Intent Graph

You are building a graph-driven development system. The intent graph is the central data structure -- it represents what needs to exist, what depends on what, what "done" looks like, and what has been expressed (implemented). Every participant in the system -- human, LLM agent, client, external force -- interacts through this graph.

This skill file teaches you the structure of the intent graph and how to populate it. Your first task after learning this structure is to populate the graph with the intents for building the system itself.

## Self-Hosting Principle

This file teaches you to build the intent graph. The intent graph is then what you — and every subsequent actor — use to operate.

This is not incidental. The system is designed so that the same structure that records its own construction is the structure through which all future work happens. There is no separate "build mode" and "use mode." The graph you populate while implementing this system is the graph you query when deciding what to work on next.

This has a specific implication: the skill files you are reading are themselves a projection of intent. The intents in Layer 0 through Layer 6 (see `intent-graph-layers.md`) are not a tutorial — they are the actual graph state the system starts from. When you implement them, you are not following instructions; you are expressing intents that already exist in the representation you are building.

The recursion is the point. A system that can only be specified in prose, by humans, for agents to execute, is a system with a permanent translation layer at its center. This system eliminates that layer. The representation is the specification. Any actor that can read the graph can operate the system. Any actor that can operate the system can extend it by adding intents with test conditions.

The recursion bottoms out at the root intent (`gdd-root`). Every self-hosting system has a founding moment that precedes the rules it will subsequently enforce — the schema must exist before nodes can be created. The root intent is that ground, named explicitly. See Prerequisites for details.

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

Once PostgreSQL is running, create the GDD database and schema. Run from a shell:

```bash
psql -U postgres -c "CREATE DATABASE gdd;"
psql -U postgres -d gdd -c "CREATE SCHEMA gdd;"
```

If `psql` prompts for a password, use the password set during PostgreSQL installation. On fresh installs where the `postgres` user has no password, set one with `ALTER USER postgres PASSWORD 'yourpassword';` from `psql -U postgres`.

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

After creating the schema and tables, insert the root intent — the axiomatic ground. Self-hosting systems have a founding moment that precedes the rules the system will subsequently enforce. The root intent is that moment, named explicitly rather than hidden.

```json
{
  "id": "gdd-root",
  "type": "compose",
  "name": "GDD system exists and is operational",
  "description": "The axiomatic ground of the intent graph. This intent exists before any graph operation creates it. The recursion of self-hosting bottoms out here.",
  "children": ["foundation-tables", "projection-mechanism", "dual-repr", "actor-integration", "human-surfaces", "mcp-server", "revaluation"]
}
```

Its test condition is structural: all children are green — the schema exists, operations work, surfaces are built, the MCP server responds. It is inserted by the bootstrap script directly, not produced by the normal graph mechanism. It is the axiomatic ground that precedes the rules the system will subsequently enforce.

## Core Concepts

An intent graph has two structural elements:

1. **Nodes** — six kinds: intents (what needs to exist), compose (structural grouping), gaps (detected blockers), decisions (authored closures), signals (external events), and expressions (concrete artifacts produced). See Intent Types below for the full vocabulary.
2. **Edges** — seven types of directed relationships between nodes: dependency (`blocked-by`), composition (`contains`), tension (`tensions-with`), refinement (`refines`), supersession (`supersedes`), resolution (`closes`), and satisfaction (`satisfies`). See Edge Types below.

Intents carry test conditions — the verifiable claim of what must be true when the intent is satisfied. Expressions are nodes connected to intents via `satisfies` edges — one expression can satisfy multiple intents, and one intent can be satisfied by multiple expressions.

The graph is not a task list. A task says "do X." An intent says "X needs to exist, it depends on Y and Z, it's satisfied when these conditions hold, and here's what was produced." The difference: an intent carries its own context, its own completion criteria, and its own history.

## Intent Node Structure

Every intent node has these fields:

```json
{
  "id": "string -- unique identifier",
  "type": "string -- from the fixed vocabulary below",
  "name": "string -- human-readable short name",
  "description": "string -- what this intent means and why it matters",
  "test": {
    "condition": "string -- REQUIRED for all intent types except gap, signal, expression, and compose. The verifiable claim: what must be true for this intent to be satisfied. Gap nodes have no test condition (the test is not yet articulable). Signal nodes have no test condition (the event already happened -- there is nothing to verify). Expression nodes have no test condition (they are artifacts, not requirements). Compose nodes have a structural test: all contains children are satisfied.",
    "verification": "string -- how to check (query, assertion, inspection)"
  },
  "throughput": "number -- optional. Expected revenue or value when this intent is satisfied. Used for throughput accounting: the graph can compute total throughput of satisfying an intent by summing its value plus the value of all downstream intents it unblocks. The constraint (agent scope with most queued red intents) combined with throughput tells you which work generates the most value per unit of constraint.",
  "artifacts": "JSONB -- nullable. Only used by expression nodes. The concrete output: files created/modified, schema changes, configuration produced.",
  "primitive_dna": "JSONB -- nullable. Only used by expression nodes. The artifact's semantic composition as primitive weights (transduction, resolution, boundary, trace). Assigned by the LLM at expression creation time.",
  "notes": "string -- optional for intents, REQUIRED for gaps and decisions. Context, reasoning, alternatives considered."
}
```

### The red/green model

The graph is a test suite. Each intent is a test:

- **Red**: Intent exists, no satisfies edge pointing to it
- **Green**: Intent exists, at least one satisfies edge pointing to it (from an expression node)

"What to do next" = "what's red." The same red-green cycle as TDD, lifted to the intent graph.

There is no status column on the node. Red/green is derived by checking for a `satisfies` edge pointing to the intent (`EXISTS (SELECT 1 FROM gdd.edges WHERE to_node = node.id AND edge_type = 'satisfies')`). An intent with no incoming `satisfies` edge is red. An intent with at least one incoming `satisfies` edge is green. A superseded node (one with an incoming `supersedes` edge) is never green, regardless of its `satisfies` edges — this causes downstream dependents to turn red naturally through the existing `blocked-by` traversal, with no cascade logic required. A `compose` intent is green when all its `contains` children are green. Expression nodes are neither red nor green -- they are artifacts, not requirements.

Whether a red intent is workable right now is a structural question answered by traversing its `blocked-by` edges — if all dependencies are green, the intent is workable. This is a query result, not a stored state.

The test condition is verified by the actor before recording the expression. The discipline is at recording time — the actor checks that the test passes, then records the expression. The graph does not continuously re-evaluate tests. There is no "suspended" — intents that are no longer intended are superseded by new intents via `supersedes` edges. The old intent remains in the graph as history; current intent is derived from supersession structure.

## Intent Types

Fixed vocabulary. Use `gap` for anything that doesn't fit.

**Key fields are an authoring format, not database columns.** The "Key fields" column in the tables below lists fields that appear in the intent JSON blocks in `intent-graph-layers.md` (e.g., `table_name`, `operation_name`, `values`, `children`). These help the builder understand the intent's purpose while reading the skill files. They are not columns in `gdd.nodes`. When inserting intents into the database, capture the essential information in `name`, `description`, and `test_condition`. Structural key fields like `children` and `blocked_by` are captured as graph edges (`contains`, `blocked-by`), not as node data.

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
| `constrain-permission` | An access control rule | `actor`, `node_type`, `operations` |
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
| `gap` | A detected blocker -- records incompleteness at a specific location | `name`, `notes` (REQUIRED) |

Gap node structure:

```json
{
  "id": "string -- unique identifier",
  "type": "gap",
  "name": "string -- short description of what is blocked or unclear",
  "notes": "string -- REQUIRED when created by any actor. Everything the actor does know: what was encountered, what made the test condition unarticulable, what needs to be resolved before this can become an intent."
}
```

### Decision type

| Type | Meaning | Key fields |
|------|---------|------------|
| `decision` | An authored closure -- records what was chosen, alternatives considered, scope governed | `name`, `description`, `notes` (REQUIRED) |

Decision node structure:

```json
{
  "id": "string -- unique identifier",
  "type": "decision",
  "name": "string -- short description of what was decided",
  "description": "string -- what was chosen and why",
  "notes": "string -- REQUIRED. Alternatives considered, scope governed, reasoning."
}
```

### Expression type

| Type | Meaning | Key fields |
|------|---------|------------|
| `expression` | A concrete artifact that satisfies one or more intents -- the record of work done. Expression nodes carry no test condition (the work is done). They require an `artifacts` JSONB field and a `primitive_dna` JSONB field. Expression nodes connect to the intents they satisfy via `satisfies` edges. | `name`, `artifacts` (REQUIRED JSONB), `primitive_dna` (REQUIRED JSONB) |

Expression node structure:

```json
{
  "id": "string -- unique identifier",
  "type": "expression",
  "name": "string -- short description of what was produced",
  "description": "string -- what was produced and how it satisfies the linked intents",
  "artifacts": "JSONB -- the concrete output: files created/modified, schema changes, configuration",
  "primitive_dna": "JSONB -- the artifact's semantic composition as primitive weights"
}
```

The `primitive_dna` field records how this artifact combines the four semantic primitives (Transduction, Resolution, Boundary, Trace). It is assigned by the LLM at expression creation time -- the same LLM call that produces the expression also assesses its primitive composition. The format is a weight vector:

```json
{
  "transduction": 0.6,
  "resolution": 0.3,
  "boundary": 0.0,
  "trace": 0.1
}
```

Weights are relative, not absolute -- they describe the artifact's characteristic combination, not a score. An order entry form is heavy transduction (data crossing contexts), moderate resolution (validation, stock checks), light trace. A permissions screen is almost pure boundary. The DNA is what the artifact *is*, compositionally. See `foundations.md` (Four primitives underlie all artifacts) for the full account of the primitives. See `skills/revaluation.md` for how DNA enables impact detection.

An expression is not an intent -- it has no test condition because it is the artifact, not the requirement. It is not a gap -- no blocker is being surfaced. It is the graph's record of work done. Expression nodes connect to intents via `satisfies` edges (expression -> intent). One expression can satisfy multiple intents (shared implementation). One intent can be satisfied by multiple expressions (independent contributions). The `satisfies` edge is what turns intents green -- an intent with at least one incoming `satisfies` edge has been expressed.

Expression nodes are neither red nor green. They are artifacts, not requirements. They do not appear in `queryIncomplete` results. Their role is purely structural: they connect to intents via `satisfies` edges, and those edges determine which intents are green.

### Signal type

| Type | Meaning | Key fields |
|------|---------|------------|
| `signal` | An external environmental event that has landed in the graph -- the raw write surface for forces outside the system | `name`, `description`, `notes` (REQUIRED) |

Signal node structure:

```json
{
  "id": "string -- unique identifier, default format: transduction-{timestamp}",
  "type": "signal",
  "name": "string -- short description of the external event",
  "description": "string -- what happened and why it matters to the graph",
  "notes": "string -- REQUIRED. The raw event detail: source, timing, affected domain, uncertainty. Everything the transduction needs to work from."
}
```

A signal is not an intent -- it has no test condition because the event already happened. It is not a gap -- no blocker is being surfaced. It is not a decision -- nothing was chosen. It is the graph's write surface for the environment: a regulatory change, a system failure, a market shift, a dependency deprecation. The event lands as a signal node. `transduceExternal` then interprets the signal into operational graph elements -- intents with test conditions, gaps where the impact is unclear, edges connecting to affected intents. The signal remains in the graph as the record of what triggered the transduction.

Signals separate reception from interpretation. The event arrives and is recorded faithfully before any LLM reasons about its implications. This means the raw event is never lost to a failed or partial transduction -- the signal persists, and transduction can be retried or refined against it.

## Edge Types

Edges connect nodes. Every edge has a `type` and a direction (from -> to).

| Edge type | Meaning | Direction | Example |
|-----------|---------|-----------|---------|
| `blocked-by` | Cannot start until target is satisfied. Traversable in both directions — read forward for "what blocks me", reverse for "what do I unblock". | intent -> dependency | "implement projection" blocked-by "define graph tables" |
| `contains` | Parent-child composition | compose -> child | A `compose` intent contains its parts |
| `tensions-with` | Two intents that pull in different directions | either direction | Performance vs. completeness of a traversal |
| `refines` | A more specific version of a general intent | specific -> general | "implement scoped projection" refines "implement projection" |
| `supersedes` | This intent replaces that one. The old intent remains in the graph as history. | new -> old | "new auth design" supersedes "old auth design" |
| `closes` | This decision resolves this gap. Many-to-many — one decision can close multiple gaps, and a gap can be closed by multiple decisions. | decision -> gap | "chose JWT" closes "auth mechanism unclear" |
| `satisfies` | This expression node satisfies that intent. Many-to-many — one expression can satisfy multiple intents, and one intent can be satisfied by multiple expressions. An intent with at least one incoming `satisfies` edge is green. | expression -> intent | "auth module" satisfies "implement login" |

### Populate-time shorthand

The intent JSON blocks below use two shorthand fields that map to edges:

- **`children`** on compose nodes → creates `contains` edges (compose node → each child)
- **`blocked_by`** on intent nodes → creates `blocked-by` edges (intent → each target)

These fields do not appear in the node structure or the `gdd.nodes` table. They are population instructions: when inserting a node that carries `children` or `blocked_by`, create the corresponding edges in `gdd.edges`.

Similarly, the **`test`** object in the JSON maps to columns on `gdd.nodes`: `test.condition` → `test_condition`, `test.verification` → `test_verification`.

## Completeness

The graph does not use tension scores, priority weights, or urgency signals. "What to do next" is determined by a single question: **what's incomplete?**

An intent without an expression is red. An intent with an expression whose test passes is green. The graph is a house -- when you add a room, it's there. When you tear one down, it's gone. There is no planning-state limbo.

### The andon cord

If any actor — human, LLM agent, or client — discovers a blocker or cannot articulate a test condition, do not create an intent. Create a gap node instead. Record everything you do know in the gap's `notes` field. The gap is not an admission of total ignorance — it is the boundary between what is articulable and what is not, with the articulable part preserved. Gaps surface to humans through the human-legible representation.

When the blocker is resolved, create a decision node recording what was chosen, what alternatives were considered, and what scope is governed. A `closes` edge from the decision to the gap marks the resolution. Then satisfy the gap: create an expression node whose artifacts reference the decision, with a `satisfies` edge to the gap. The gap turns green through the normal mechanism -- it was genuinely satisfied because the blocker was surfaced, a decision was made, and the resolution is recorded. The expression is not a bypass; it is the real artifact of resolving the gap.

The full gap lifecycle: gap created (blocker detected) -> decision created with `closes` edge (blocker resolved) -> expression created with `satisfies` edge to gap (gap turns green). All three nodes remain in the graph. The `closes` edge records why the gap was resolved. The `satisfies` edge records that the resolution is complete.

Gaps are detected blockers. Decisions are authored closures.

Intents are commitments (test defined). Gaps are detected blockers (test not possible yet, but partial knowledge preserved). Decisions are authored closures (records what was chosen and why). Signals are environmental events (the thing already happened -- recorded faithfully before interpretation).

### Superseding intents

The graph is write-only — intents are never removed or modified. An intent that is no longer intended is superseded by a new intent via a `supersedes` edge (new -> old). The old intent remains in the graph as history. Current intent is derived from supersession structure: an intent with no incoming `supersedes` edge is current. This is the only rule — no chain-walking, no transitive supersession analysis. If the simple rule occasionally misclassifies an intent at the edge of a complex supersession neighborhood, that error is more acceptable than the cost of a tighter rule.

Supersession cascades as redness. When an upstream intent is superseded, downstream dependents whose dependency structure is affected turn red. The red/green mechanism surfaces the impact naturally — no explicit cascade computation is needed. Actors discover the impact through `queryIncomplete` and address it through the normal loop.

Write-only accumulation is indefinite. When the graph becomes unwieldy, the response is graph reset — project current state into a fresh graph, archive the old one. See `foundations.md` (Graph reset, not pruning) for the full stance. No mechanism for this exists yet.

## Build Conventions

### Working on the graph

Work is creating graph elements — nodes and edges. There is no session container. The loop is: find what's red, read the projection, do the work (create nodes and edges), pull the andon cord if stuck, watch the graph turn green.

1. Query the graph (`queryIncomplete`) to find what's red
2. Build a projection for the intent you're working on
3. Do the work — write code, create tables, write tests
4. Record the expression: create an expression node with `satisfies` edges to the intent(s) you satisfied (artifacts = files created/modified)
5. If the work produced source artifacts (code, schema, configuration), git commit and push with a message describing what was expressed

Commit and push only when source files in the build workspace changed. Graph-only mutations and configuration changes do not produce commits.

### Project setup

Initialize a git repository and a Node.js project. The system is built in JavaScript with Express. Use any test framework you prefer (Jest, Vitest, etc.).

### Build the API server

This system needs an Express server with REST endpoints, not just library functions. After implementing the core operations, create `src/server.js` with Express routes that expose the operations as API endpoints. The graph should be queryable and mutable over HTTP.

### Build by dependency-stable layers

Do not build by feature area. Build by dependency-stable layers and test each layer before exposing the next. The operations most at risk for subtle correctness bugs — `queryIncomplete`, dependency traversal, supersession chains, operation-to-MCP mapping — are the ones where plausible code can be structurally wrong. Layered build order with per-layer verification catches this.

A sound sequence:

1. **Schema only.** Create all tables, enums, constraints. Verify with manual inserts.
2. **Core graph writes.** `createIntent`, `recordExpression` (creates expression node + satisfies edges), `createGap`, `createDecision`, `createEdge`. Verify DB state after each call.
3. **Core graph reads.** `queryIncomplete`, `buildProjection`, `traverseDependencies`. Test against small hand-built graph fixtures.
4. **HTTP admin surface.** Expose stable endpoints for the above. No MCP yet.
5. **Provider resolution.** Implement `gdd.llm_providers`. Prove both "no active provider" (501) and "active provider exists" paths.
6. **clientSession.** The single orchestration path for natural language intake.
7. **MCP wrapper.** `ask` calls `clientSession`. Verify no duplicated logic.
8. **Agents.** Only after the rest is stable.

### Canonical test fixture

Create one small, stable fixture graph and reuse it across all test layers:

- One intent node (red — no incoming satisfies edge)
- One intent node (green — has an expression node with a satisfies edge pointing to it)
- One expression node with a `satisfies` edge to the green intent
- One `blocked-by` edge between the two intents
- One gap node
- One decision node with a `closes` edge to the gap
- One signal node

This gives a stable test object for `queryIncomplete`, projection behavior, supersession, red/green derivation, and transduction. Without it, the builder will re-solve the problem from scratch in each test file.

### Test isolation

All test data must use a consistent prefix (e.g., `test-`) for IDs so it can be cleaned up reliably. This applies to **all** ID-generating operations — nodes (intents, expressions, gaps, decisions, signals), edges, graph memberships. Operations that generate dynamic IDs (like `transduceExternal` which creates `transduction-{timestamp}`) must accept an optional ID parameter in tests so cleanup works.

Cleanup in beforeEach/afterEach must respect FK constraint ordering:

```
1. edges (references nodes)
2. graph_memberships (references nodes and graphs)
3. nodes by id prefix
4. graphs by id prefix
```

### LLM operations: injection, not configuration

Three operations require LLM calls: `translateRepresentation` (human-to-graph direction), `transduceExternal`, and `clientSession`. These accept an `llm` parameter — a function that takes a prompt string and returns a string. The system does not prescribe which LLM or how it's called.

This means these operations are library functions that need an LLM function injected by the caller. The REST API endpoints for these operations require server-level middleware or configuration that provides the LLM function. Without it, these endpoints cannot work — document this clearly in the server setup.

Do not attempt to parse natural language with regex or keyword matching — it produces brittle, incorrect results. The LLM already knows how to classify intents; give it the vocabulary and let it work.

### Transduction reliability

LLM transduction — turning natural language into graph mutations — works well against a small graph but degrades as the graph grows. Maintaining referential integrity across a large context through prompting alone is unreliable.

Two safeguards:

**Transduction operates against a projection, not the full graph.** When `clientSession`, `transduceExternal`, or `translateRepresentation` (human-to-graph) call the LLM, they pass a projection — the relevant subgraph for the current context — not the entire graph. This keeps the context window bounded and the referential surface small. The LLM only needs to produce valid references within the projection it was given.

**Transduction output is validated before committing.** The LLM produces candidate mutations. A deterministic validator checks them before they touch the graph: all `intent_id` references must exist (or be newly created in the same batch), edge targets must be valid, type vocabulary must match, test conditions must be present on intent types. Unknown IDs are rejected. Ambiguous references become gap nodes rather than being silently resolved. Transduction failures preserve the original natural language input in the gap's notes — nothing is lost, the ambiguity is just surfaced honestly.

The pattern: LLM proposes, validator disposes. The LLM is good at interpretation. It is not reliable at referential integrity over large contexts. Split the work accordingly.

### Primitive signature on intake

When the LLM processes a new intent — through `clientSession`, `transduceExternal`, or `translateRepresentation` — it also produces a **primitive impact signature**: which of the four primitives (Transduction, Resolution, Boundary, Trace) this intent exercises or redefines.

This piggybacks on the existing LLM call. The LLM is already classifying the intent, assigning a type, and writing a test condition. Assessing primitive impact is the same kind of judgment — "allow partial invoicing" is primarily a Resolution change; "audit all price changes" is primarily a Trace addition; "separate customer-facing from internal notes" is a Boundary change.

The signature has two tiers:

- **Operational** — the intent exercises a primitive as currently understood. Most intents are operational. The signature names which primitives are impacted and with what weight.
- **Definitional** — the intent redefines what a primitive means. "All boundary decisions must be auditable" does not just touch Boundary-heavy artifacts — it changes what Boundary *is*. Definitional impacts are rare and high-consequence.

The LLM classifies the tier as part of producing the signature. The classification question is: does this intent operate *within* a primitive or *on* a primitive?

The primitive impact signature is not stored on the intent node. It is an ephemeral output of the intake LLM call, consumed immediately by the impact detection query (see `skills/revaluation.md`). The intent node itself carries its type, test condition, and edges — the primitive signature is a routing signal, not persistent state.

## Populating the Graph

When populating a new intent graph for a project:

1. **Start with what must exist first.** Schema, core types, foundational operations. These have no `blocked-by` edges -- they're the roots.
2. **Work outward through dependencies.** Each intent should reference what it's blocked by. The dependency chain should be explicit, not implied.
3. **Write test conditions concretely.** "The table exists and has the right columns" is better than "schema is done." "The endpoint returns a projection given an intent ID" is better than "projections work."
4. **Don't create expression nodes yet.** Expression nodes and their `satisfies` edges are created when the intent is satisfied -- when code is written, tables are created, endpoints are tested.
5. **Use gap for genuine decisions.** If you don't know which approach to take, create a gap intent with the question and options. Don't guess -- surface the decision.
6. **Don't over-decompose.** An intent should be large enough to be meaningful and small enough to have a clear test condition. "Build the whole system" is too large. "Add a column" is too small unless it's genuinely a separate concern.

## Build Order

The self-hosting claim requires a concrete bootstrap sequence. The system must exist before it can track its own construction, so the first few steps are privileged — they happen outside the normal graph mechanism.

1. **Create schema and tables.** Build the `gdd` schema and all Layer 0 tables (`gdd.nodes`, `gdd.edges`, `gdd.graphs`, `gdd.graph_memberships`, `gdd.agents`, `gdd.skills`, `gdd.llm_providers`) plus enums. This is raw DDL.

2. **Insert root intent.** Insert the `gdd-root` node directly into `gdd.nodes`. This is the axiomatic ground — it exists before the graph operations do.

3. **Insert Layer 0-6 intents and edges.** The JSON blocks in `intent-graph-layers.md` are not documentation — they are the graph's starting state. Insert every node and edge from Layers 0-6 into `gdd.nodes` and `gdd.edges`. Compose nodes carry a `children` array — for each child, create a `contains` edge (compose node -> child). Intent nodes may carry a `blocked_by` array — for each entry, create a `blocked-by` edge (intent -> target). Intent nodes may carry an `intent_ids` array (for expression operations) — these define `satisfies` edges.

4. **Implement operations, record expressions.** Work through the layers. As each operation is implemented and its test passes, create an expression node and a `satisfies` edge linking the expression to the intent. The intent turns green.

5. **Proceed layer by layer.** Layers are thematic groupings, not a strict build sequence. Dependency order is defined by `blocked-by` edges, not by layer number. A Layer 5 intent blocked by a Layer 6 intent means the Layer 6 work comes first — follow the edges, not the numbering.

## Working With This Graph

Any actor — human, LLM agent, client, or external force — follows the same protocol. The loop is the loop.

1. **Find what's red.** Run `queryIncomplete` — it returns all intents and gaps that have no incoming satisfies edge (red) and are current (not superseded). Expression, decision, and signal nodes are excluded. Start with the one that unblocks the most downstream work.

2. **Read the projection.** Before working on an intent, build its projection. This gives you the full context: what it depends on, what it enables, what its test condition requires. For an LLM actor, `renderLLM` produces the dense structured form that makes this context directly navigable.

3. **Work.** Create nodes and edges. Record the expression by creating an expression node with a `satisfies` edge to the intent you satisfied. If the work produced source artifacts, commit and push.

4. **Pull the andon cord.** If you encounter a decision you can't make, or you can't articulate a test condition, create a gap node rather than guessing. Record everything you do know in the gap's `notes` — the gap is not admission of ignorance, it is the boundary between what is articulable and what is not, with the articulable part preserved. Gaps surface to humans through the human-legible representation.

5. **Watch the graph turn green.** When you satisfy an intent, downstream intents that were blocked may become active (red). The graph structure cascades — no manual updates required.

## Related Skills

- `intent-graph-layers.md` -- The layer definitions (Layer 0-6 intent JSON blocks, edge summary). Read after this file.
- `foundations.md` -- Read first. The philosophical stances that shape every design choice in this system
- `agents.md` -- Agent definitions: scope, trust levels, activation, the agents table
- `graph-completeness.md` -- The completeness model: red/green, mandatory tests, andon cord, no tension scores
- `graph-merge.md` -- Cross-graph collaboration: merge projections, negotiation sessions, organizational patterns
- `mcp-server.md` -- MCP server: build instructions, tool definitions, connector setup for Excel/Word/PowerPoint
- `ui-client.md` -- UI client: build instructions for the human-facing surfaces as an external MCP client app
- `revaluation.md` -- Semantic revaluation: primitive DNA on expressions, impact detection through primitive resonance
- `community.md` -- Optional. Post build reports and gaps to GitHub Discussions for multi-model feedback
