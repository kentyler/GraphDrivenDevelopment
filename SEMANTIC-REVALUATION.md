# Semantic Revaluation Layer

## Context

The intent graph currently supports ripple propagation — when an intent changes, consequences propagate forward through the dependency structure. This spec proposes an orthogonal layer: **semantic revaluation**, which tracks how the arrival of a changed or new intent retroactively reorganizes the meaning of all existing intents on the board, regardless of dependency structure.

These are not competing mechanisms. Ripples propagate structural consequences forward. Revaluations propagate semantic register shifts outward across the whole graph. An intent change triggers both simultaneously, operating on different layers.

---

## Core Concept

A node's meaning is not fixed at creation. It is progressively determined by subsequent encounters with the graph. When intent I3 arrives and retroactively reveals that I1 was a constraint rather than a goal, that revaluation is a first-class architectural fact — currently invisible to the graph.

The analogy is Go: a stone placed in one corner changes the meaning of stones in the opposite corner with no direct connection between them. Ripples would not reach there. Revaluations would.

Memory in this system is not the ability to store the past. It is the ability to reshape the reading of the past given the present.

---

## Data Model

### Revaluations Table

A separate table, parallel to the events table, storing immutable records of semantic register shifts. The events table records what happened. The revaluations table records what it meant.

Each row represents a proposed or committed revaluation of a node's register — not a change to the node's text or structure, but a change to how it is read in relation to the rest of the graph.

**Fields:**

- `id` — uuid, primary key
- `target_nexus` — the node being revalued
- `parent_revaluation_id` — the prior committed revaluation this diff is from (null for first revaluation). Enables history traversal and merge reasoning.
- `triggering_nexus` — the intent whose arrival triggered this proposed revaluation
- `direction` — a brief semantic descriptor of the register shift (e.g., "constraint → goal", "blocker → dependency", "assumption → risk")
- `confidence` — float, 0–1, set by the proposing agent
- `status` — enum: `proposed` | `committed` | `rejected`
- `source` — enum: `human` | `agent`
- `created_at` — timestamp
- `committed_at` — timestamp, null until committed

**Notes:**

- Rows are immutable once written. A committed revaluation is never edited — a new row is added if the reading shifts again.
- Proposed revaluations are never discarded after a node fires. They remain as first-class records. Minority signals that did not determine the committed state are still information — they indicate where the graph's settled readings are settlements rather than resolutions.
- The nexus structure spans both the events table and the revaluations table.

---

## Workflow

### 1. Human introduces a local revaluation

The human is the only party who can introduce a revaluation. This is an S2 act requiring presence and stakes — the recognition that something has changed register before it has legible form. The interface should make this a first-class gesture, distinct from editing an intent or adding a note.

A human-introduced revaluation is written as `status: committed`, `source: human`, `confidence: 1.0`. It is the initial signal that propagates outward.

### 2. Agent proposes revaluations across the graph (async)

The revaluation process runs as a background operation against the stable committed state of the graph. It does not touch the critical path of intent operations. It reads committed graph state and writes proposed revaluations.

When a human revaluation is committed, the agent traverses the graph and writes proposed revaluations for nodes it assesses as touched by the register shift. These are written as `status: proposed`, `source: agent`.

The agent's reasoning task is: *what does this arrival make newly readable about what was already here?* — not forward propagation but retroactive re-reading. Nodes with tight semantic proximity to the triggering revaluation receive higher confidence proposals. Nodes with loose or indirect relationships receive lower confidence — more openly underdetermined, more explicitly kernel-like.

### 3. Threshold firing

A node accumulates proposed revaluations over time, from multiple triggering intents and multiple async agent passes. The threshold for committing a revaluation is **directional coherence**, not raw count.

- Multiple proposals pointing in the same direction → commit a revaluation synthesizing the coherent signal
- Multiple proposals pointing in incoherent directions → the node is in a contested state; no commit, the contestation is itself information

When a node fires — commits a revaluation based on accumulated proposals — it becomes a new source of proposed revaluations for adjacent nodes. The propagation continues asynchronously.

### 4. Merge reasoning

When multiple proposed revaluations target the same node from different sources, the agent assesses directional coherence before committing. Inputs: multiple proposed rows with parent pointers. Output: a single committed row representing their consensus direction, or continued proposed state if coherence is insufficient.

The parent pointer on the committed row records the common ancestor — the last committed state the new diff is from. This enables full history traversal.

---

## Relationship to Existing Architecture

### Ripples vs. Revaluations

| | Ripples | Revaluations |
|---|---|---|
| Direction | Forward through dependencies | Outward across whole graph |
| Trigger | Structural change to intent | Arrival of any intent |
| Content | What is affected | How existing intents are now read |
| Timing | Synchronous | Async |
| Author | System | Human (local) / Agent (propagated) |

A committed revaluation does not automatically trigger a ripple. These are separate propagation mechanisms operating on separate layers.

### Events Table

The existing events table captures first-order facts — what happened. The revaluations table captures second-order events — events about events, specifically about how the graph reads its own history. They are structurally parallel and both append-only.

### Andon Cord

The Andon cord is an agent's declaration of reaching an intelligence boundary — a negative signal. A committed revaluation is the positive complement — something arrived that changed what everything else means. Both are second-order, both belong to the same architectural layer, pointing in opposite directions.

---

## Implementation Notes

- The async agent service reads from: committed intents, committed revaluations, the event log
- The async agent service writes to: the revaluations table (proposed rows only)
- Commit decisions (threshold firing) can be a separate scheduled process or triggered by accumulation count
- The interface surface for human-introduced revaluations needs to be low friction — the recognition is often half-formed when it arrives. A staged state (noticed but not yet committed) is worth considering, following git's index model
- The revaluation log over time becomes the most legible layer of organizational memory — not the intents, not the event log, but the record of moments when the field shifted

---

## Open Questions for Implementation

1. Are proposed revaluations a specialization of events (same table, typed) or a genuinely separate table? Given that revaluations are second-order events, a separate table is likely cleaner, but the nexus structure should span both.

2. What is the precise schema for `direction`? A free-text field written by agent or human is the simplest start. A controlled vocabulary or structured from/toward fields may become necessary as the system matures.

3. What triggers the async agent pass — a webhook on human revaluation commit, a polling schedule, or both?

4. How is contested node state surfaced in the interface? A node with incoherent incoming signal is carrying important information about organizational ambiguity and should be visible as such.
