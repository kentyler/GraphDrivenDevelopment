# Graph Completeness Model

**This is the decision log that produced the current spec.** The decisions below have been applied to `intent-graph.md`. Operation names referenced in the "Impact on Existing Code" section (e.g., `computeTension`, `queryActive`, `recomputeStatus`, `applyCommit`) refer to an earlier design and no longer exist in the current spec. This document is retained as the reasoning record — the authoritative spec is `intent-graph.md`.

Resolves `gap-tension-derivation`. Emerged from discussion on 2026-04-15.

## Core Principle: The House Metaphor

The graph is a house. A house is always what it is — when you add a room, it's there. When you tear one down, it's gone. There is no state where the house has a "planned room" that doesn't exist yet.

Intents come into existence *with* their expression. There may be a brief transient moment (construction), but the graph does not enter a special waiting state. It assumes all intents are intended to be expressed.

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

If an LLM is creating an intent but cannot articulate a test condition, that's diagnostic information — the requirement isn't understood well enough. The LLM should:

- **Not** create an intent with a null test condition
- **Instead** create a `gap` node — surfacing the ambiguity for human resolution

The gap *is* the pulled andon cord. Intents are commitments (test defined). Gaps are questions (test not possible yet). Compose nodes are structural — their test is "all children satisfied," not hand-written.

Three node kinds, three test condition rules:
- **Intent nodes**: test condition required (the verifiable claim)
- **Gap nodes**: no test condition (that's what makes them gaps)
- **Compose nodes**: structural test (all `contains` children are satisfied)

This replaces the old trust scoping rule that said clients can't create test conditions. Any actor that can state an intent can state what done looks like. If they can't state what done looks like, they don't have an intent — they have a question.

### 5. The graph doesn't inscribe its own history

The graph is versioned (mutations table tracks before/after state). The graph itself represents current intent only:

- A node no longer intended is **removed**, not suspended or superseded
- History lives in the mutation log, not in the graph topology
- The `supersedes` edge type may be unnecessary — you delete the old node, create the new one, and the mutation log records both

### 6. Cascading removal

Removing an intent must cascade. If intent A is removed and intent B depended on A:
- The impact must be dealt with as part of the removal
- This is structural (like tearing down a load-bearing wall), not administrative

Cascade semantics need to be defined in implementation.

### 7. Status removed

**Resolved.** The `potential` -> `active` -> `satisfied` lifecycle treated the graph like a task tracker. Under the house model, an intent is red (no expression) or green (has expression). This is derived from expression presence in `gdd.expressions`, not stored as a status column or as fields on the node. There is no status enum, no `recomputeStatus` operation, and no expression columns on `gdd.nodes`. `blocked-by` is a structural constraint — workability is derived at query time by checking whether all dependencies have expressions.

## Impact on Existing Code

### Must change
- `createIntent`: reject null/missing `test_condition`
- `clientSession` LLM prompt: remove "clients cannot create test conditions"; instead instruct: create intent with test if clear, create gap if not
- `transduceExternal` LLM prompt: same routing — intent with test or gap
- `translateToGraph` LLM prompt: always require test_condition
- `applyCommit`: proposal intents must include test_condition

### May change
- `computeTension`: replaced by a simple completeness query (intents without expressions)
- `queryActive`: redefine as "return intents without expressions" instead of tension-sorted active nodes
- Status enum and `recomputeStatus`: **removed** -- red/green derived from expression presence
- `createEdge` with `blocked-by`: semantics shift from scheduling to structural

### Unchanged
- `recordExpression`: still the mechanism that turns red to green
- Hybrid session mode: becomes more important — explorations hold uncommitted thinking, graph holds expressed reality
- Mutation tracking: still the history/versioning layer
