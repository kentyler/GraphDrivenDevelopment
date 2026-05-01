# GDD Field Report #1: Building the Harness

**Date:** 2026-04-28
**Phase:** GDD construction (pre-photo-app)

## Context

Building a Graph-Driven Development instance from spec, then using it to drive a ~10TB family photo management application. This report covers the GDD build itself — the photo app hasn't started yet.

## What happened

The entire GDD system — database schema, 17 REST endpoints, MCP server with 17 tools, admin dashboard, 56 intent nodes across 7 layers, 113 edges, all expressed green — was built from the skill files in a single session. No ambiguity required going back to the user for clarification on the system design. The skill files were sufficient as implementation instructions.

## What we're learning

**The spec is the build.** The skill files aren't documentation *about* a system — they're precise enough that "read spec, build what it describes" is the entire workflow. The blocked-by edges gave natural ordering. The test conditions gave unambiguous "done" criteria. There was no design phase separate from implementation because the graph *is* the design, expressed as testable assertions.

**Self-hosting works but feels strange.** The graph that tracks "is the graph system built?" is the graph system itself. During bootstrap you're inserting nodes that describe the tables you just created to store those nodes. It's circular in a productive way — once you're through it, completeness is verifiable by querying the graph for red intents. Zero red = done. No human judgment call about "is this feature complete enough."

**Layer -1 emerged naturally.** After the system was built, the question surfaced: "why PostgreSQL? why Express? those were decisions too." The system-origins concept — inscribing founding decisions as already-green intent/expression pairs — slotted in without any structural change. The graph accommodated a new category of knowledge (substrate choices) using the same node types and edge semantics. The existing supersession mechanism means these choices are changeable later without pretending they were never made.

**The instruction set is writable by the process it instructs.** Adding system-origins.md required updating cross-references in three other skill files. This is the "LLM writes its own skill files" pattern from foundations.md happening at the meta level — the system's construction instructions are being refined by the act of construction.

**What's actually in the database now:** Every architectural decision is queryable. "What depends on PostgreSQL?" is a graph traversal, not a grep through docs. "What would break if we changed the MCP transport?" is an impact detection query. The photo app will inherit this — every design choice will be a node, every dependency an edge, every "why" a decision node closing a gap.

## Open questions heading into the photo app

- **Granularity:** The GDD's own intents are architectural ("build the projection mechanism"). The photo app will have operational intents ("catalog folder X", "dedup set Y"). How does the graph feel at high volume with many small intents?
- **Natural language intake:** The LLM-powered `client-session` endpoint exists but hasn't been exercised with a real provider yet. The photo app is where this gets tested — can "scan D:\Photos\2019" become a well-formed intent without the user touching the graph directly?
- **Agent activation:** Agents are defined but none have run. The photo app's dedup pass is a natural first agent — scoped to a folder, trusted to create intents and record expressions, triggered manually. Will the loop (find red → work → express → repeat) actually flow?
- **Projection utility:** Projections are built and rendered. But are they *useful* mid-build? When there are 200 photo-app intents, does `buildProjection` on a vantage point give you orientation or just noise?

## Stance going in

The GDD is not a task tracker. It's not Jira with a graph database. The bet is that making every decision — including "what folder structure should the catalog use?" — into a testable node with explicit dependencies produces a kind of architectural memory that compounds over time. The photo app build is the first real test of whether that compound interest materializes or whether the overhead swamps the value.

## Next

Create the photo-app graph, seed it with the first intents (catalog the D: drive), and start working against it.
