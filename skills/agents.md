# Agents

Agents are named, scoped, trust-bounded autonomous actors. Their definitions live in the `gdd.agents` table — persistent, queryable, part of the graph's operational state.

## What an agent definition separates

In the popular sense, "agent" bundles together things the graph model keeps separate:

| Concern | Where it lives |
|---------|---------------|
| Who the actor is | Agent row: id, name, metadata |
| What it works on | Agent row: scope (projection spec, intent IDs, or tag) |
| What it can do | Agent row: trust level (write permissions on node types) |
| How it works | The standard loop — same for all actors |

An agent is not a new kind of thing. It is a precise, persistent definition of an autonomous actor that runs the same loop every actor runs.

## Actor-agnostic definitions

Nothing in an agent definition requires the actor to be an LLM. The definition is: identity, scope, trust, trigger. The graph doesn't care what kind of actor fills that definition.

| Actor | Scope | Trust | Trigger | Example |
|-------|-------|-------|---------|---------|
| LLM agent | Narrow subgraph | full | event (new-red-in-scope) | Autonomous builder that picks up red intents as they appear |
| Individual developer | Feature area | full | manual | Senior dev who owns authentication |
| Junior developer | Feature area | express-only | manual | Can write code but not create new intents without review |
| Team | Broad subgraph | full | manual | Frontend team owns all UI intents |
| Scout (LLM) | Whole graph | gaps-only | schedule (daily) | Scans for ambiguity, surfaces gaps with notes |
| Mixed: human + LLM | Shared scope | human: full, LLM: express-only | LLM: event | Human creates intents and resolves gaps, LLM expresses them |

A team is an agent with a broader scope. A specialist is an agent with a narrow scope and full trust. Mixed human-LLM pairs share a scope with different trust levels — the human directs intent, the LLM produces expressions. Coordination happens through the graph, not through standups.

## Scheduling through projection

Traditional scheduling asks "when should each task happen?" and produces a timeline. The graph asks a different question: "given these agents and their scopes, what is the shape of the remaining work?"

A projection of intents over agents produces something like a schedule without anyone writing one:

**Critical path emerges from structure.** The longest chain of red intents where each is blocked-by the previous — and where the agents assigned to each have no overlap — is the critical chain. No one computes it. It's visible in the projection.

**Resource contention is scope overlap.** Two agents with overlapping scopes competing for the same red intent is the graph equivalent of resource contention. A projection that shows scope overlap on the critical path tells you where the bottleneck is — without a resource leveling algorithm.

**Buffer health is gap accumulation.** In CCPM, buffer consumption tells you project health. Here, the rate at which gaps appear on the critical path vs. the rate at which red turns green is the same signal. A projection filtered to critical-path intents with gap counts per agent shows buffer penetration.

**"What if" is re-scoping.** Want to know what happens if you add an agent to a scope? Re-project. The new projection shows the changed critical path, the reduced contention, the intents that are now covered. Want to know what happens if someone leaves? Remove their agent definition from the projection. The uncovered red intents are immediately visible.

**No estimates needed.** Traditional scheduling requires duration estimates, which humans are bad at and which introduce padding. The graph doesn't ask "how long will this take?" It asks "what's red, who can work on it, and what does it unblock?" The schedule is the current state of the graph projected over agent scopes — it updates every time an intent turns green or a gap appears.

**Throughput accounting.** Intents carry an optional `throughput` value — expected revenue or value when satisfied. The graph can compute total throughput of satisfying an intent by summing its value plus the value of all downstream intents it unblocks. Project the constraint (the agent scope with the most queued red intents) against throughput, and you get Goldratt's core question answered structurally: which work generates the most throughput per unit of constraint? No spreadsheet, no separate financial model — the value flows through the same dependency edges.

## Long-term projects

The dependency chain is the timeline. A 2-year project doesn't need Gantt charts or calendar dates — `blocked-by` edges create natural temporal ordering. A red intent with unsatisfied dependencies is structurally not ready — workability is derived from the edges, not stored as a status.

The key is granularity over time. Near-term work has clear test conditions — those are intents. Far-term work is hazier — those are gaps with notes. As time passes and gaps get resolved, they become intents with tests. The graph evolves from coarse to detailed, from the outside in.

A 2-year project at population time might look like:

- **Phase 1** (near-term): 40 intents with concrete tests, fully decomposed. Agents scoped and active.
- **Phase 2** (mid-term): 15 intents with tests + 10 gaps. Intents are blocked-by Phase 1 work. Gaps say "we know we need this but can't specify the test yet." A `gaps-only` scout agent reviews these periodically.
- **Phase 3** (far-term): 5 high-level compose intents + 20 gaps. Compose intents group broad areas. Gaps capture everything known so far.

All exist in the present. All are real graph state. The gaps aren't vague plans — they're honest statements of "we know this much and not more." As Phase 1 turns green:

- Phase 2 intents that were blocked become workable (their dependencies now have expressions)
- Phase 2 gaps get resolved into intents as knowledge accumulates
- Phase 3 comes into focus — its gaps are revisited, some become intents
- Agent scopes shift to cover newly active phases

The roadmap is a projection. Project it over agent scopes and you see who's working on what. Add throughput values and you see which phases deliver the most value. Watch the red/green ratio over time and you see velocity. Watch gap accumulation on the critical path and you see risk.

No one maintains this roadmap. It maintains itself. Every expression recorded, every gap resolved, every intent created changes the projection. The "2-year plan" is not a document someone updates quarterly — it's the current state of the graph.

This is not a full scheduling system. It doesn't handle calendar time, vacations, or meeting overhead. But for the questions project management actually cares about — "are we going to finish, where are the risks, and which work is most valuable?" — the projection over agents answers them structurally.

## Table: `gdd.agents`

```
id              text        PK
name            text        Human-readable agent name
scope           jsonb       Jurisdiction definition (see Scope below)
trust_level     enum        full | express-only | gaps-only
trigger         jsonb       When to activate (see Trigger below)
status          enum        defined | active | paused
created_at      timestamp   When defined (administrative metadata)
```

### Scope

Scope defines which intents the agent operates on. Three forms:

```json
{"type": "intents", "ids": ["intent-a", "intent-b", "intent-c"]}
{"type": "tag", "tag": "authentication"}
{"type": "projection", "root": "intent-a", "depth": 3}
```

The agent's `queryIncomplete` is filtered to its scope. It cannot see or mutate intents outside its jurisdiction.

### Trust levels

| Level | Can create intents | Can record expressions | Can create gaps | Can create edges |
|-------|-------------------|----------------------|-----------------|-----------------|
| `full` | Yes | Yes | Yes | Yes |
| `express-only` | No | Yes | Yes | No |
| `gaps-only` | No | No | Yes | No |

A `gaps-only` agent is a scout — it explores its scope, identifies what it can't resolve, and surfaces gaps with notes. A `full` agent can do everything a human can within its scope.

An `express-only` agent is more powerful than it appears. Satisfying an intent is an interpretive choice — the test condition constrains what passes, but not how. When multiple approaches satisfy the same test and the choice between them matters, the andon cord applies: create a gap with notes rather than making a silent architectural decision. The andon cord is not just for test articulability — it applies to expression confidence.

### Trigger

Trigger defines *when* the agent activates. The definition is declarative — the graph says when, a scheduler runtime honors it.

```json
{"type": "manual"}
{"type": "event", "on": "new-red-in-scope"}
{"type": "schedule", "cron": "0 */4 * * *"}
{"type": "continuous", "poll_interval": "5m"}
```

| Type | Meaning |
|------|---------|
| `manual` | Only activated by explicit `activateAgent` call. Default. |
| `event` | Activated when a specific event occurs in scope. `new-red-in-scope` fires when an intent in the agent's scope becomes active (red). |
| `schedule` | Activated on a cron schedule. Agent runs, processes red intents in scope, stops, waits for next tick. |
| `continuous` | Always running. Polls for red intents at the specified interval. Pauses when scope is all green, resumes when new red appears. |

The trigger is part of the agent's identity — it lives in the graph. The scheduler that reads triggers and activates agents is infrastructure outside the graph. The graph is declarative; the scheduler is the runtime.

### Status

- **defined**: Agent exists but is not running
- **active**: Agent is currently executing
- **paused**: Agent was running but stopped (gap encountered, scope exhausted, manual pause)

## Operations

### `defineAgent`

Create an agent definition.

**Input**: id, name, scope, trust_level, trigger (defaults to manual)
**Output**: Agent row in gdd.agents

### `activateAgent`

Start an agent running.

1. Read the agent definition from gdd.agents
2. Set agent.status to 'active'
3. Provide `renderLLM` output filtered to the agent's scope
4. Agent runs the standard loop:
   - `queryIncomplete` (within scope) → pick highest-unblocking red intent
   - `buildProjection` → understand context
   - Execute → write code, modify state
   - `recordExpression` → create expression node + satisfies edges, turn intent(s) green
   - Loop
5. Agent stops when:
   - All intents in scope are green
   - A gap is created (agent hit something it can't resolve)
   - Manual stop
6. Set agent.status to 'paused' or 'defined'
7. If the work produced source artifacts, commit and push

### `queryAgents`

List agents with their status, scope, and gap counts.

**Input**: Optional filters (status, scope overlap with intent)
**Output**: Array of agent definitions with current state

## Referencing agents in intents

Intents can reference agents:

- `"define agent auth-builder with scope [authentication intents] and trust full"` → intent whose expression creates an agent row
- `"activate agent auth-builder"` → intent whose expression starts the agent
- An agent's gaps become red intents or gaps that surface to whoever defined the agent

## Overlapping scopes

Two agents with overlapping scopes create a `tensions-with` edge worth surfacing. This isn't necessarily wrong — one might be `full` trust and the other `gaps-only` (scout before builder). But overlapping `full` agents on the same intents need human attention.

## Enums

Add to Layer 0:

```
gdd.agent_trust: full, express-only, gaps-only
gdd.agent_status: defined, active, paused
```
