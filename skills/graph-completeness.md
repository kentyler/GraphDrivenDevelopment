# Graph Completeness Model

**This is the decision log that produced the current spec.** The decisions below have been applied to `intent-graph.md` and `intent-graph-layers.md`. Operation names referenced in the "Impact on Existing Code" section (e.g., `computeTension`, `queryActive`, `recomputeStatus`, `applyCommit`) refer to an earlier design and no longer exist in the current spec. This document is retained as the reasoning record -- the authoritative spec is `intent-graph.md`.

Resolves `gap-tension-derivation`. Emerged from discussion on 2026-04-15.

## Core Principle: The Accumulated Plans

The graph is not the house -- it is the accumulated set of plans. The house is projected from the plans. Every plan ever drawn remains in the set, but superseded plans are marked as such. The current house is derived from the plans that have not been superseded.

Intents come into existence *with* their expression. There may be a brief transient moment (construction), but the graph does not enter a special waiting state. It assumes all intents are intended to be expressed. The graph is write-only -- intents are never removed or modified, only superseded.

## Decisions

### 1. Tension is dissolved

`computeTension` with weighted signals and priority scoring is the wrong abstraction. The graph doesn't need a mechanism to tell you what's urgent. It needs to tell you what's incomplete.

**What to do next** = intents without expressions. That's the only signal. No scores, no weights, no signal sources.

### 2. Red/Green (TDD at the architecture level)

The graph is a test suite:
- **Red**: intent exists, expression does not (or test condition is not satisfied)
- **Green**: intent exists, expression exists, test passes

"What to do next" = "what's red." The same red-green cycle as TDD, lifted to the intent graph.

Apply a commit, intents appear without expressions, graph goes red. Write the expressions, graph goes green. The red state is intentional and temporary — it's the working state, not an error to manage.

### 3. No intent without a test condition

Test conditions are mandatory on intent creation. An intent without a test condition is not an intent — it's a vague gesture.

The test condition *is* the intent. Name and description are human-friendly labels. The test condition is the verifiable claim: what must be true when this intent is satisfied.

Following XP: the expression only needs to satisfy the test. It could be a literal string or a complex system. The simplest thing that passes.

### 4. The Andon Cord

If any actor discovers a blocker or cannot articulate a test condition, that's diagnostic information -- the requirement isn't understood well enough, or something is incomplete at a specific location. The actor should:

- **Not** create an intent with a null test condition
- **Instead** create a `gap` node -- surfacing the blocker for resolution
- When the blocker is resolved, create a `decision` node with a `closes` edge to the gap, then create an expression node with a `satisfies` edge to the gap (artifacts reference the decision). The gap turns green through the normal mechanism.

The gap IS the incompleteness -- no actor attribution metadata is needed because the content carries the perspective. Decisions are the counterpart to gaps: an authored closure recording what was chosen, alternatives considered, and scope governed.

Intents are commitments (test defined). Gaps are detected blockers (test not possible yet). Decisions are authored closures (records what was chosen and why). Signals are environmental events (the thing already happened). Compose nodes are structural -- their test is "all children satisfied," not hand-written.

Six node kinds, six test condition rules:
- **Intent nodes**: test condition required (the verifiable claim)
- **Gap nodes**: no test condition (that's what makes them gaps -- they are blockers)
- **Decision nodes**: no test condition (they are deliberation nodes, not operational ones)
- **Signal nodes**: no test condition (the event already happened -- there is nothing to verify)
- **Expression nodes**: no test condition (they are artifacts, not requirements -- they carry `artifacts` JSONB instead)
- **Compose nodes**: structural test (all `contains` children are satisfied)

This replaces the old trust scoping rule that said clients can't create test conditions. Any actor that can state an intent can state what done looks like. If they can't state what done looks like, they don't have an intent -- they have a question.

### 5. The graph inscribes its own history

**Reversed from original decision.** Under write-only semantics, the graph IS its own history. There is no separate mutation log.

- A node no longer intended is **superseded** via a `supersedes` edge (new -> old), not removed
- History lives in the graph topology -- the `supersedes` edge chain IS the history
- The `supersedes` edge type is needed: it records what replaced what, and the chain is navigable
- Current intent is derived from supersession structure: a node with no `supersedes` edge pointing at it is current

### 6. Cascading redness (replaces cascading removal)

**Revised from original decision.** There is no removal. Superseding an upstream intent turns downstream dependents red -- their dependency structure has been affected. The red/green mechanism surfaces the impact naturally.

- Supersession does not cascade as deletion -- it cascades as redness
- Actors discover the impact through `queryIncomplete` and address it through the normal loop
- No two-phase confirmation, no agent thresholds for cascade size -- all unnecessary under supersession

### 7. Status removed

**Resolved.** The `potential` -> `active` -> `satisfied` lifecycle treated the graph like a task tracker. Under the house model, an intent is red (no incoming satisfies edge) or green (has an incoming satisfies edge from an expression node). This is derived from `satisfies` edges in `gdd.edges`, not stored as a status column or as fields on the node. There is no status enum, no `recomputeStatus` operation, and no expression columns on `gdd.nodes`. `blocked-by` is a structural constraint — workability is derived at query time by checking whether all dependencies have incoming satisfies edges.

### 8. Expressions are graph nodes

Expressions are first-class graph nodes (type `expression`), not rows in a subordinate `gdd.expressions` table. This enables many-to-many satisfaction: one expression node can satisfy multiple intents (via multiple `satisfies` edges), and one intent can be satisfied by multiple expression nodes. The old one-to-one model (`gdd.expressions` with `intent_id` FK) was too restrictive -- shared implementations, cross-cutting concerns, and collaborative expression all require many-to-many. Expression nodes carry an `artifacts` JSONB field and connect to intents via `satisfies` edges. They have no test condition and are neither red nor green.

### 9. Graph memberships replace graph_id

Nodes belong to graphs through `gdd.graph_memberships` (a join table), not through a `graph_id` column on `gdd.nodes`. This enables fragments as overlapping subgraphs: a node can appear in memberships for multiple graphs, serving as a shared boundary node. The old `graph_id` column forced each node into exactly one graph, making fragment overlap impossible without duplicating nodes. Shared boundary nodes are how graphs compose -- the boundary is structural, not a copy.

### 10. satisfies as first-class edge type

`satisfies` (expression -> intent) is the seventh edge type. It completes the expression-as-node model: an expression node connects to the intents it satisfies via `satisfies` edges. An intent with at least one incoming `satisfies` edge is green. This replaces the old derivation that checked for a row in `gdd.expressions`. The edge model makes many-to-many satisfaction natural and visible in the graph topology.

## Impact on Existing Code

### Must change
- `createIntent`: reject null/missing `test_condition` for intent types. Accept null for gaps, decisions, signals, expressions, compose. Expression nodes require `artifacts` JSONB.
- `recordExpression`: now creates an expression node + `satisfies` edge(s), accepts `intent_ids[]` instead of single `intent_id`. No longer inserts into `gdd.expressions` table.
- `queryIncomplete`: derive red/green from `satisfies` edges, not from `gdd.expressions`. Exclude expression nodes from results.
- `buildProjection`: include expression nodes linked via `satisfies` edges. Accept optional `graph_id` for scoping via memberships.
- `clientSession` LLM prompt: remove "clients cannot create test conditions"; instead instruct: create intent with test if clear, create gap if not
- `transduceExternal` LLM prompt: same routing -- intent with test or gap
- `translateToGraph` LLM prompt: always require test_condition for intent types

### New operations
- `createGap`: convenience operation for creating gap nodes (notes required)
- `createDecision`: create decision nodes with optional `closes[]` array of gap IDs
- `supersedeIntent`: create `supersedes` edge (new -> old), mark old as superseded
- `linkExpression`: add `satisfies` edge from existing expression node to another intent
- `createGraph`: create a graph identity in `gdd.graphs`
- `addNodeToGraph`: create a membership in `gdd.graph_memberships`
- `removeNodeFromGraph`: delete a membership from `gdd.graph_memberships`
- `queryGraphNodes`: list nodes belonging to a graph via memberships
- `nodeGraphs`: list graphs a node belongs to via memberships

### Removed
- `removeIntent`: no removal under write-only semantics -- replaced by `supersedeIntent`
- `createSession`, `closeSession`, `sessionDiff`, `sessionHistory`: no sessions
- `sessionProjection`, `intersectGraphs`: no session-based projections
- Sessions table, mutations table: removed from schema
- **`gdd.expressions` table**: removed -- expressions are now nodes in `gdd.nodes` with `satisfies` edges
- Session status enum, actor type enum: removed
- `computeTension`, `queryActive`, `recomputeStatus`: replaced by `queryIncomplete`
- Status enum: removed -- red/green derived from satisfies edges

### Unchanged
- `createEdge`: now supports seven edge types (added `supersedes`, `closes`, `satisfies`)
