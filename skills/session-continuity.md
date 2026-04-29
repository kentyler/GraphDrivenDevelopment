# Session Continuity

LLM actors arrive without context. The graph solves this the same way it solves everything else — with intents and expressions.

## The problem

Every new LLM session starts cold. The actor doesn't know what was done, what's next, or what's unresolved. This is a structural gap, not a per-session accident. It recurs every time any LLM actor connects.

## The mechanism

Each actor gets a persistent intent: `session-context-{actor-id}`. Its test condition is: the arriving LLM can project from this node and recover full working context without consulting any other source.

At the end of each session, the actor records an expression satisfying this intent. The expression carries:

- **name**: session date and summary headline
- **description**: narrative of what happened
- **artifacts**: structured JSON with fields:
  - `actor` — who recorded this
  - `session_date` — when
  - `project` — which project
  - `completed` — what was done
  - `next` — what should happen next
  - `open_questions` — what's unresolved

Each new session-end expression adds to the chain. The expressions accumulate as the development history — the graph embeds the project narrative through its normal operation.

## Startup routine

An arriving LLM's first action:

```
GET /api/projection/session-context-{actor-id}/llm
```

One call. The response contains the vantage intent, all expressions (most recent is the current bookmark), and any gaps or decisions in the neighborhood. The actor reads the latest expression's artifacts and is oriented.

## Per-actor scoping

Session context is scoped per actor, not shared. Each actor maintains its own bookmark chain:

- `session-context-claude-code` — a Claude Code instance's working context
- `session-context-ken` — a human developer's context
- `session-context-copilot` — another LLM tool's context

This prevents interleaving. An arriving actor reads only its own history and picks up where it left off.

## Team-level view

A team is an actor that belongs to itself. The team gets:

1. **A graph** (in `gdd.graphs`) whose members are the `session-context-*` intents of all actors on the team
2. **Its own session-context intent** (`session-context-team-{project}`) added as a member of its own graph

The team's bookmark records project-level milestones — not individual session context. It aggregates.

Querying the team graph gives the full picture:

- The team's own bookmark: where the project stands
- Each actor's bookmark: what each individual is doing

Adding an actor to the team:

```
POST /api/intents  { id: "session-context-{new-actor}", ... }
POST /api/graphs/add-node  { graph_id: "team-{project}", node_id: "session-context-{new-actor}" }
```

## Creating the session-context intent

When an actor first connects and no `session-context-{actor-id}` exists, create one:

```
POST /api/intents
{
  "id": "session-context-{actor-id}",
  "type": "implement-operation",
  "name": "Session continuity for {actor-id} actor",
  "description": "An arriving {actor-id} instance projects from this intent to recover its working context. Scoped to one actor to support multi-developer workflows.",
  "test_condition": "{actor-id} projecting from this node can state current project status, identify next task, and list open questions without reading any other source."
}
```

## Recording a session bookmark

At session end:

```
POST /api/expressions
{
  "name": "Session {date}: {headline}",
  "description": "{narrative of what happened}",
  "intent_ids": ["session-context-{actor-id}"],
  "artifacts": {
    "actor": "{actor-id}",
    "session_date": "{date}",
    "project": "{project}",
    "completed": ["..."],
    "next": ["..."],
    "open_questions": ["..."]
  }
}
```

## No new machinery

This mechanism uses only existing graph primitives — intents, expressions, satisfies edges, graphs, graph memberships. No new node types, no special tables, no session containers. The graph already knows how to do this.
