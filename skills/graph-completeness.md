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
- When the blocker is resolved, create a `decision` node with a `closes` edge to the gap

The gap IS the incompleteness -- no actor attribution metadata is needed because the content carries the perspective. Decisions are the counterpart to gaps: an authored closure recording what was chosen, alternatives considered, and scope governed.

Intents are commitments (test defined). Gaps are detected blockers (test not possible yet). Decisions are authored closures (records what was chosen and why). Signals are environmental events (the thing already happened). Compose nodes are structural -- their test is "all children satisfied," not hand-written.

Five node kinds, five test condition rules:
- **Intent nodes**: test condition required (the verifiable claim)
- **Gap nodes**: no test condition (that's what makes them gaps -- they are blockers)
- **Decision nodes**: no test condition (they are deliberation nodes, not operational ones)
- **Signal nodes**: no test condition (the event already happened -- there is nothing to verify)
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

**Resolved.** The `potential` -> `active` -> `satisfied` lifecycle treated the graph like a task tracker. Under the house model, an intent is red (no expression) or green (has expression). This is derived from expression presence in `gdd.expressions`, not stored as a status column or as fields on the node. There is no status enum, no `recomputeStatus` operation, and no expression columns on `gdd.nodes`. `blocked-by` is a structural constraint — workability is derived at query time by checking whether all dependencies have expressions.

## Impact on Existing Code

### Must change
- `createIntent`: reject null/missing `test_condition` for intent types. Accept null for gaps, decisions, compose.
- `clientSession` LLM prompt: remove "clients cannot create test conditions"; instead instruct: create intent with test if clear, create gap if not
- `transduceExternal` LLM prompt: same routing -- intent with test or gap
- `translateToGraph` LLM prompt: always require test_condition for intent types

### New operations
- `createGap`: convenience operation for creating gap nodes (notes required)
- `createDecision`: create decision nodes with optional `closes[]` array of gap IDs
- `supersedeIntent`: create `supersedes` edge (new -> old), mark old as superseded

### Removed
- `removeIntent`: no removal under write-only semantics -- replaced by `supersedeIntent`
- `createSession`, `closeSession`, `sessionDiff`, `sessionHistory`: no sessions
- `sessionProjection`, `intersectGraphs`: no session-based projections
- Sessions table, mutations table: removed from schema
- Session status enum, actor type enum: removed
- `computeTension`, `queryActive`, `recomputeStatus`: replaced by `queryIncomplete`
- Status enum: removed -- red/green derived from expression presence

### Unchanged
- `recordExpression`: still the mechanism that turns red to green
- `createEdge`: now supports six edge types (added `supersedes`, `closes`)
