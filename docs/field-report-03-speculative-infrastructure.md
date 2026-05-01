# GDD Field Report #3: Speculative Infrastructure

**Date:** 2026-04-30
**Phase:** Prediction layer build + photo-app trail run

## Context

The photo app's trail folder is cataloged — 186 files, 180 faces detected, 11 clusters, four people identified by name. The GDD graph drove that work through 15 intents, all green. Meanwhile, a parallel question emerged from the throughput accounting design: can the graph handle prediction engines — autonomous agents that assess speculative revenue with confidence scores?

This report covers building infrastructure for a use case that doesn't exist yet, and what happened when the graph's own semantics objected to the first implementation.

## What happened

The prediction layer started as six new operations: write a throughput prediction, derive engine confidence from track record, query intents by confidence-weighted throughput, refresh stale predictions, record actual outcomes, and identify the system constraint. Straightforward CRUD against existing node types and edges.

The first implementation passed every mechanical test. Modules loaded, endpoints responded, queries returned results. Then we asked the structural question: "can the current graph handle the cases described in the throughput accounting spec?" The graph said no.

**The satisfies-edge bug.** `updateThroughput` was creating a `satisfies` edge from prediction expressions to intents. This made intents go green — the graph's "done" signal. A corn price prediction was making the "sell corn at target price" intent look satisfied. The intent then vanished from `queryByConfidence` — the very query designed to prioritize speculative work. The graph's own red/green model caught the error: a prediction is not an implementation. Prediction expressions connect to intents through artifact metadata, not through structural edges. The graph's ontology rejected the design before any real data could be corrupted by it.

**The ordering collapse.** `queryByConfidence` originally sorted engine-predicted intents first, manual-throughput intents second — two tiers. A $1M manually-assessed intent sorted after a $100 engine prediction. The fix was a single scale: confidence defaults to 1.0 for manual throughput, and everything sorts by `(own + downstream) * confidence`. Engine-assessed and manually-assessed work compete on the same axis.

**The staleness depth.** `refreshThroughput` checked only direct dependencies for new signals. But if a signal arrives three hops upstream, the prediction is just as stale. The fix was a recursive CTE traversing the full upstream dependency chain.

**The missing outcome recorder.** `deriveEngineConfidence` expected signal nodes with actual outcome values, but nothing created them. The operation existed in the design but not in the code. Added `recordOutcome` — a signal node with `actual_value` in its artifacts.

After fixing all of these, we compared the implementation against the full throughput accounting and CCPM design document. Most of Goldratt's framework was either implemented or structurally implied by the graph. But the prediction engine infrastructure — confidence calibration, outcome recording, staleness detection — was serving a use case that hadn't materialized. No prediction engines exist. No speculative revenue needs assessing. The infrastructure was real; the demand was hypothetical.

The resolution: a feature flag. `GDD_PREDICTION_LAYER=true` in `.env` gates all prediction operations — endpoints, MCP tools, agent hooks. When off, the modules don't load. The code stays in the project as executable documentation of the design. When the use case arrives, it's one environment variable away.

The final addition was an observer for rate-based metrics. The throughput accounting spec describes buffer health as "rate of red-to-green transitions versus rate of gap creation" — a temporal metric. But the graph's ontology says history is topology, not timestamps. The resolution: the graph already has `created_at` on every node (PostgreSQL puts it there). An observer queries the graph over time windows and computes rates. The graph doesn't know about rates; it just records facts. The observer reads the ledger. This keeps temporal concerns out of the graph's present-tense structure.

## What we're learning

**The graph's ontology is a design critic.** The satisfies-edge bug wasn't caught by tests or by reading the code. It was caught by asking a structural question: "what does the graph say is true?" The graph said intents were done when they weren't. The red/green model — designed for a completely different purpose — surfaced a semantic error in a system built months after the model was specified. Structural honesty compounds.

**Building to remember is a legitimate strategy.** The prediction layer exists because "my way of remembering things is to build them into the project." This is the opposite of documentation-first. The feature flag makes the code dormant but present — an executable spec waiting for activation. The alternative was a design document that would drift from reality the moment it was written. The code can't drift; it either loads or it doesn't.

**Speculative infrastructure has a natural scope boundary.** The prediction layer work revealed that some pieces are immediately useful regardless of prediction engines — aggregate downstream throughput, constraint identification, buffer depth. These are core graph queries that happen to be prerequisite for prediction work. The pure speculation (confidence calibration, outcome recording, engine track records) gates cleanly behind the flag. The boundary between "useful now" and "useful later" was discovered during construction, not during planning.

**Observer separation preserves ontological commitments.** The graph's nodes exist in present tense: this intent is red, this expression satisfies that intent, this edge records a dependency. Rates — things per unit time — require an observer standing outside the graph, looking at it over intervals. Baking rates into the graph would compromise its present-tense character. The `queryFlowMetrics` operation is explicitly an observer: it reads `created_at` timestamps that the graph carries incidentally and computes something the graph itself doesn't claim to know.

**The graph absorbs Goldratt without structural extension.** Throughput propagation, constraint identification, buffer depth, opportunity cost registers, drum-buffer-rope — all of these map onto existing node types and edge semantics. No new tables, no new edge types, no schema migration beyond one nullable JSONB column. The original graph vocabulary — intents, expressions, blocked-by, satisfies — was sufficient to represent an entire operations management framework. This wasn't planned; the vocabulary was designed for software development.

## Open questions

- **When does the prediction layer turn on?** The flag exists. The code is ready. But the trigger is a real use case — an agent that actually needs to assess speculative revenue. Will the photo app produce one, or will it come from a different project?
- **Does "build to remember" scale?** One feature-flagged layer is manageable. Ten would be a codebase archaeology problem. Is there a point where dormant code becomes a maintenance burden rather than executable memory?
- **Observer frequency:** `queryFlowMetrics` answers "what happened since X?" But who calls it, and how often? A dashboard polling every minute is very different from an agent checking buffer health before making a scheduling decision. The observer exists; the observation schedule doesn't.
- **OE classification:** The throughput accounting spec describes operating expenses as either load-bearing (structurally connected to throughput) or pure overhead (no dependency path to revenue). The graph can represent this — it's a reachability query. But the convention for *tagging* an intent as OE doesn't exist yet. Type field? Name prefix? A new edge type? This is the one piece of Goldratt that needs a design decision before it can be structural.

## Next

Back to the photo app. The trail folder is cataloged and partially identified. The remaining work: finish naming the unknown clusters, merge Ken's fragmented clusters, generate thumbnails, then scale to the remaining ~55 folders on the D: drive. The GDD graph will drive this — each folder scan as an intent, each completion as an expression. The prediction layer sleeps until something wakes it up.
