# GDD Field Report #2: Session Continuity

**Date:** 2026-04-29
**Phase:** GDD construction (pre-photo-app)

## Context

Day two. The GDD system is built, all 96 nodes green. Before starting the photo app, we hit the first real operational question: how does a new LLM session pick up where the last one left off?

## What happened

The session opened with the LLM reading the graph cold — querying tables, reading source files, piecing together what existed. It took eight tool calls and some trial-and-error to reconstruct context that the previous session held natively. This was the problem making itself visible.

The solution fell out of the graph's existing primitives. An LLM arriving without context is a gap — a structural one, not per-session. The fix: a persistent intent (`session-context-{actor-id}`) whose expressions are session bookmarks. Each bookmark carries structured artifacts — what was done, what's next, what's unresolved. An arriving LLM projects from its bookmark intent and is oriented in one call.

We then scoped it per actor (each LLM instance, each human, each tool gets its own bookmark chain) and added team-level grouping (a team is an actor that belongs to its own graph, containing its members' bookmark intents). A new skill file (`session-continuity.md`) was added to the instruction set, and CLAUDE.md was updated to make bookmark checking the first action for any new instance.

## What we're learning

**The graph absorbs operational problems.** Session continuity wasn't in the original spec. It emerged from using the system and noticing friction. The fix required zero new node types, zero schema changes, zero new operations — just a convention for using existing primitives (intents, expressions, graphs, memberships) in a specific pattern. The graph's vocabulary was already sufficient.

**Expressions are the development narrative.** The session bookmark mechanism revealed that the expression chain on an intent isn't just "proof that something was done" — it's the project history. Each session-end expression is a permanent record. The graph becomes both the state of the system and the story of how it got there. This wasn't designed; it was discovered.

**Per-actor scoping is necessary, not optional.** The first implementation used a single shared `session-context` intent. Immediately obvious problem: multiple actors' bookmarks would interleave. The fix was trivial (namespace by actor ID), but the insight matters — the graph's default unit of context is the actor, not the project. Team-level views are aggregations, not the primary structure.

**The LLM projection endpoint is the startup API.** Layer 3 (dual representation) was built as a rendering convenience. It turns out to be the session bootstrap mechanism. `GET /api/projection/session-context-{actor}/llm` is the single call that rehydrates an arriving LLM. The infrastructure was already there waiting for this use case.

**The instruction set keeps growing from inside.** Yesterday's field report noted that the skill files are writable by the process they instruct. Today that happened again — the session continuity skill file was written during the session that invented the mechanism. The instruction set now teaches future instances something that no instance knew yesterday morning.

## Open questions

- **Bookmark staleness:** What happens when a session ends abnormally and no bookmark is recorded? The LLM arrives to stale context. Is there a mitigation, or is "stale is better than nothing" sufficient?
- **Expression accumulation:** As sessions pile up, the expressions array on a session-context intent grows indefinitely. At what point does the projection become noisy? Should old expressions be summarized or archived?
- **Team bookmark granularity:** When should the team-level bookmark be updated — every session, at milestones, on demand? Who writes it?
- **Cross-project context:** An actor working on multiple projects has multiple bookmarks. Is there a meta-bookmark, or does the actor just check each project's bookmark independently?

## Next

Create the photo-app intent graph and begin the catalog phase. The session continuity mechanism will get its first real test when the next session opens and tries to bootstrap from today's bookmark.
