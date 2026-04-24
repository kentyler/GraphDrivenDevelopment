# Foundations

Read this before the technical spec. The first half explains why the system is shaped the way it is — the intellectual commitments that precede the design. The second half describes the stances you need to hold while building it — the patterns you'll instinctively reach for that the system deliberately avoids.

---

## Part 1: Why the system is this shape

### Context is structural, not reconstructed

A task in a backlog carries no context. Every time you pick one up, you reconstruct what it depends on, what it enables, what "done" means, what was tried before. The context lives in people's heads, in Slack threads, in meeting notes — anywhere except the task itself.

An intent node carries its context structurally. What it depends on is in its `blocked-by` edges. What it enables is in the reverse of those edges. What "done" means is in its test condition. What was produced is in its expression. What was tried is in the supersession chain.

The graph exists because context should be structural — encoded in the relationships between nodes — not reconstructed from memory every time someone picks up the work. This is the foundational choice. Everything else follows from it.

### Test-first at the architecture level

The intent graph is not analogous to TDD. It IS TDD, lifted from functions to intents.

In XP, you write the test before the code. The test IS the specification — it says exactly what "done" means. The code only needs to be the simplest thing that makes the test pass. You don't write code without a test, and you don't write a test you can't verify.

The intent graph applies the same discipline at the architecture level. The test condition IS the intent — it says exactly what must be true. The expression only needs to satisfy the test. You don't create an intent without a test condition (that's a gap, not an intent), and you don't write a test condition you can't verify.

Red/green is not a metaphor borrowed from testing. It is the same mechanism. An intent is red when it has a test and no passing expression. It is green when the expression satisfies the test. "What to do next" is "what's red" — exactly as in TDD.

This is the deepest design commitment in the system and it precedes everything else. If you understand only one thing about the intent graph, understand this: it is a test suite at the architecture level, and it inherits TDD's discipline — no intent without a test, no expression beyond what the test requires.

### The self-hosting proof

The system's first act is to describe its own construction. The intents in Layers 0 through 5 of `intent-graph.md` are not a tutorial — they are the actual graph state the system starts from. When you implement them, you are expressing intents that already exist in the representation you are building.

This recursion is not a demo or a convenience. It is a proof. If the intent graph cannot represent the construction of an intent graph system, it cannot represent the construction of anything. The self-hosting validates the representation: the vocabulary is sufficient, the edge types capture real dependencies, the test conditions are articulable, the layers reflect actual build order.

A system that requires a separate specification language for its own construction has a gap between its representation and reality. The intent graph closes that gap. The representation IS the specification. Any actor that can read the graph can build the system. Any actor that can build the system can extend it.

The recursion bottoms out somewhere, and the system names that somewhere explicitly. The root intent (`gdd-root`) exists before any graph operation creates it — it is inserted during schema setup, outside the normal graph mechanism. This is not a hack; it is the honest acknowledgment that self-hosting systems have a founding moment that precedes the rules they subsequently enforce. The root intent is the unmoved mover, and it is documented as such rather than hidden as an implementation detail.

### The TOC lineage

The intent graph's approach to prioritization and constraint comes from Goldratt's Theory of Constraints, not from project management.

Traditional project management asks "when should each task happen?" and produces a schedule. TOC asks "what is the constraint, and which work generates the most throughput through the constraint?" The answer determines what to work on — not urgency, not priority scores, not stakeholder pressure.

The intent graph answers this structurally. Throughput values on intents propagate through dependency edges — the total value of satisfying an intent includes the value of everything it unblocks downstream. The constraint is the agent scope (or the team, or the bottleneck resource) with the most queued red intents. Project the constraint against throughput and you get Goldratt's core question answered by the graph itself: which work generates the most value per unit of constraint?

The critical chain is not computed by an algorithm. It is the longest chain of red intents where each is blocked-by the previous. It is visible in the projection. Buffer health is the rate of gaps appearing on the critical path versus the rate of red turning green. No separate metrics system — the graph is the metrics.

This is why the system has no priority fields, no urgency scores, no scheduling algorithms. These are unnecessary when the structure itself answers the only question that matters: what to work on next.

### Dual representation exists because actors differ

The graph serves actors with fundamentally different cognitive needs. A human reading a projection needs narrative: what's done, what's next, what's blocked, what decisions were made. An LLM reading the same projection needs structure: full node data, edge types, test conditions, dependency chains — dense, relational, navigable.

These are not two UIs for the same data. They are two representations that exist because the system is designed for both human and machine actors from the start. The human-legible view is not a dashboard bolted on after the fact. The LLM-legible view is not a JSON dump. Both are first-class projections of the same graph, each shaped for the actor that reads it.

`renderHuman` is deterministic — the projection already has the data, it just needs formatting. `renderLLM` is direct serialization — the projection IS the LLM's context. `translateRepresentation` bridges between them, with the LLM doing the heavy lifting in the human-to-graph direction (natural language to structured intent) and deterministic formatting in the graph-to-human direction.

The dual representation is not a feature. It is a consequence of taking multiple actor types seriously as first-class participants in the same system.

---

## Part 2: Stances for building

The commitments above produce specific stances. These are the patterns you need to hold while implementing the system — and the conventional patterns you need to resist.

### There is no future state

Most planning systems separate "where we are" from "where we're going." A backlog is a list of desired futures. A roadmap is a timeline of planned states. A current reality tree and a future reality tree are two diagrams of the same system at different times, with a strategy to bridge them.

The intent graph has none of this. There is one graph. It represents what exists now. A red intent is not a plan — it is a hole in the present. It says "this needs to exist and doesn't yet." A green intent is not a completed task — it is something that exists and passes its test.

The future state is not a document, a diagram, or a separate artifact. The future state is just "everything green." There is no bridge to build between current and future because they are not separate things. There is one world with holes in it, and the holes are typed, testable, and dependency-ordered.

The graph accumulates intention. Superseded intents remain in the graph — they are not "current," but they are not deleted either. Current is derived from supersession structure: an intent with no `supersedes` edge pointing at it is current. An intent that has been superseded is historical. "Everything green" still means done, but the graph also contains the record of how it got there. The history is the topology, not a separate log.

When you are building this system, resist adding planning artifacts. No "planned" status. No "proposed" intents. No separation of "what we want" from "what we have." If something needs to exist, it is a red intent now. If you can't articulate what it needs to be, it is a gap now. Both exist in the present.

### The plans, not the blueprint

The graph is not the house — it is the accumulated set of plans. The house is projected from the plans. Every plan ever drawn remains in the set, but superseded plans are marked as such. The current house is derived from the plans that have not been superseded.

This means:

- An intent that is no longer intended is **superseded**, not removed. A new intent (or decision) replaces it via a `supersedes` edge. The old intent remains in the graph — it is historical, not current. Current is derived from supersession structure.
- Supersession cascades as redness, not as deletion. Superseding an upstream intent turns downstream dependents red — their dependency structure has changed. The red/green mechanism surfaces the impact naturally.
- There is no "draft" mode, no "review" state, no approval workflow baked into the graph. If an intent exists, it exists. If it has a test condition, it is a commitment. If it cannot have a test condition, it is a gap — an honest statement of "we know this much and not more."

When you are building this system, resist adding lifecycle states to intents. An intent is red (no expression) or green (has expression). That is derived from the data, not stored as a status. Every status field is an attempt to make the graph track process rather than reality.

### Graph reset, not pruning

A write-only graph accumulates indefinitely. Superseded intents, closed gaps, historical decisions — none of it is ever removed. Eventually the accumulated graph becomes unwieldy: projections traverse long supersession chains, the ratio of current to historical nodes shifts, and the graph's size outgrows its utility as a working surface.

The response is not pruning. Pruning contradicts write-only semantics and requires judgment calls about what to discard — judgment that belongs in the graph, not in a maintenance operation applied to it. Instead, when the graph becomes unwieldy, seed a new graph from the old one. Project the current state — all non-superseded intents, their edges, their expressions — into a fresh graph. The old graph is archived whole. The new graph starts clean, carrying forward only what is current.

This is a natural lifecycle, not a failure mode. A graph that has accumulated enough history to need a reset has served its purpose — it recorded the full trajectory of intention from founding to the present. The reset is not loss; it is the graph equivalent of closing a ledger and opening a new one, with the opening balances carried forward.

No mechanism for graph reset exists yet. When it does, the operation should be: project current state, write it to a new graph, archive the old one. The projection that determines "current" is the same projection that `queryIncomplete` uses — no new logic required, just a new destination.

### Completeness, not priority

"What should I work on next?" is answered by structure, not by scores.

The system deliberately has no tension scores, no priority weights, no urgency signals, no scheduling algorithms. The answer to "what's next" is: what's red? Among red intents, which one unblocks the most downstream work? If throughput values exist, which one generates the most value per unit of constraint?

These are not computed by a scoring function. They are read from the graph. The dependency structure IS the prioritization. The longest chain of red intents is the critical path. The agent scope with the most queued red intents is the constraint. No algorithm produces these — they are visible in the projection.

When you are building this system, resist adding priority fields, urgency indicators, weight parameters, or sorting heuristics beyond downstream-dependent-count and throughput. Every scoring mechanism you add is an attempt to impose external judgment on a system that derives its own ordering from structure.

### Forecasts are projections, not commitments

The graph is correctly silent on dates. Dates are predictions about execution time, and the graph does not model execution time. But organizational stakeholders need calendar anchors, and "we don't do estimates" is not a viable answer in most contexts.

The resolution: separate the graph's commitments from forecast views derived from graph state. The graph knows the dependency structure and the current red/green state. A projection can compute: given current velocity (expressions recorded per unit time), how long does the remaining red subgraph take to clear? That is not a commitment in the graph — it is a read-only forecast, always visibly derived from current state, always updated as the graph changes.

Forecasts belong in the human-legible representation, not in the graph itself. No date fields on intents. No deadline columns in the nodes table. The forecast is a view — like `renderHuman`, it reads from the graph without writing to it. When velocity changes, the forecast changes. When intents are added or removed, the forecast changes. It is honest about what it is: a projection of current pace over remaining structure.

When you are building this system, resist adding date or deadline fields to the graph schema. If calendar views are needed, build them as read-only projections over the dependency structure and observed velocity. The graph holds commitments (what must exist and how you know it's done). Forecasts are derived, not stored.

### Agents are inside the graph

In most agent frameworks, agents are external actors that operate on a system. They have configurations, policies, permission layers, and orchestrators — all defined outside the thing they're working on. The agent is a subject; the system is an object.

Here, agents are graph state. An agent definition lives in `gdd.agents`. Its scope is a projection of the graph — not a permission boundary imposed from outside, but the shape of what the agent can perceive. Its trust level determines what operations the agent can perform — not a policy enforced by middleware, but a structural property of the agent definition. Its trigger is declarative graph state — not an external scheduler's configuration, but part of the agent's identity.

The consequence: an agent doesn't interact with the graph from outside. It is inside the graph, reading what the graph lets it see (scope), writing what the graph lets it write (trust), activated when the graph's state changes in ways it declared interest in (trigger). The constraints aren't imposed on the agent — they emerge from the same structure the agent operates on.

When you are building this system, resist adding:
- An orchestrator that manages agent lifecycle from outside the graph
- A permissions layer that checks agent actions against an external policy
- A message bus for agent-to-agent communication
- A monitoring dashboard that watches agents from a privileged vantage point

Coordination happens through the graph. Agent A records an expression on an intent, intents in Agent B's scope that were blocked by it become workable, B's event trigger fires. No messages were passed. The dependency structure is the coordination mechanism.

Oversight happens through the graph. An agent's work is visible as nodes, edges, and expressions it created. An agent that gets stuck creates a gap with notes. The gap is visible to whoever defined the agent — through the same `queryIncomplete` they use for their own work. There is no separate monitoring channel because the graph IS the monitoring channel.

### The andon cord is universal

Any actor — human, agent, client — that discovers a blocker or incompleteness at a specific location must surface it. If the actor cannot articulate a test condition, it must create a gap instead of an intent, recording everything it does know in the gap's notes. The gap IS the incompleteness — no actor attribution metadata is needed because the content carries the perspective.

This applies to more than test articulability. An express-only agent satisfying an intent is making an interpretive choice: the test condition says "users can log in with email" and the agent picks an implementation. If the agent is uncertain — if multiple approaches satisfy the test and the choice between them matters — the right action is to create a gap, not to guess. The andon cord applies to expression confidence, not just test articulability.

The gap is not an admission of failure. It is the boundary between what is articulable and what is not, with the articulable part preserved. A system that never produces gaps is not a system that has no ambiguity — it is a system that is hiding its ambiguity inside silent choices.

Decisions are the counterpart to gaps. A decision is an authored closure — it records what was chosen, what alternatives were considered, and what scope is governed by the choice. A `closes` edge from a decision to a gap marks the gap as resolved. Gaps are detected blockers; decisions are authored resolutions.

### The loop is the loop

Every actor runs the same loop:

1. Find what's red
2. Read the projection
3. Work — create nodes, edges, expressions
4. Pull the andon cord if stuck
5. Watch the graph turn green

Humans run this loop. Agents run this loop. Clients run this loop (transduced through `clientSession`). External forces run this loop (transduced through `transduceExternal`), landing first as signal nodes — the graph's write surface for the environment — before being interpreted into operational elements.

There is no special agent protocol, no human workflow, no client pipeline. The differences between actor types are: how they enter the graph (directly or transduced), what they can see (scope), and what they can write (trust). The loop itself is invariant.

When you are building this system, resist creating separate code paths for different actor types. The operations are the same. Actor differences are captured by scope and trust constraints. The loop does not branch on who is running it.

### The LLM constructs the intent

When a human user asks for something — "what were yesterday's sales," "check if any invoices are overdue," "update the status on the Henderson project" — the LLM does the work and constructs the intent. Name, type, test condition, expression — all inferred from what the ask implied. The user never needs to formulate an intent, name it, write a test condition, or know that the graph exists.

This is the LLM earning its cost. Translating a natural language ask into a structured intent with a verifiable test condition is exactly the judgment work that justifies an LLM call. The user provides the what. The LLM infers the structure.

The intent enters the graph fully formed and already satisfied. The user got their answer. The graph got a new node. Neither had to wait for the other. Every expressed intent is worth keeping — it represents work the LLM did to understand what was asked, figure out how to do it, and produce a result the user accepted. That understanding is expensive to produce and cheap to store.

Over time, the graph accumulates a complete record of everything the system has been asked to do and how it did it. Pattern detection can identify recurring intents and promote them to deterministic micro-apps that run without LLM involvement. Similarity search can offer prior solutions when new asks resemble old ones. None of this requires the user to have participated in the graph's construction — it happens because the LLM constructed the intents in the background all along.

### Consistency is not a goal

Intent naming, description style, and structural conventions do not need to be enforced across the graph. One intent named `get-yesterday-sales` and another named `fetch daily revenue summary` can coexist without reconciliation. The LLM reasons over intents by meaning, not by naming convention.

Consistency is a human readability concern. Humans need clean taxonomies because they cannot hold a thousand intents in working memory. The LLM does not have that limitation — it can navigate a graph of heterogeneous naming and recognize semantic relationships without anyone reconciling the labels.

If a human wants to inspect the graph, the LLM renders it in whatever organized form the human finds useful — grouped by domain, sorted by recency, filtered by status. The presentation is a view, not the structure. The structure serves the LLM. The views serve the human.

This applies to semantic consistency — names, descriptions, labeling style. Structural consistency is different and is enforced. Intent types must come from the fixed vocabulary. Edge types must be one of the six defined types. The graph's operations — dependency traversal, completeness queries, projection building — depend on these structural categories being correct. The LLM can name an intent however it likes, but it must classify it correctly.

When you are building this system, resist adding naming convention enforcement, style guides, or review steps that exist solely to make the graph look uniform. Optimize for what makes the LLM's reasoning effective — rich context in each intent, clear test conditions, good expressions — not for aesthetic consistency. The only way to guarantee consistency across all intents would be big design up front, which contradicts the system's core commitment to emergent structure.

### Full kitting at the constraint

The LLM is the constraint in the TOC sense — expensive per call, latent per operation, limited in throughput. Goldratt's full kitting principle applies: never let the constraint waste capacity gathering prerequisites. Everything the constraint needs should be assembled before it starts working.

In LLM terms, full kitting is preparation that happens before the LLM reasons about the user's actual request — accessing external data, loading relevant schema, finding prior similar intents, understanding output format preferences, assembling domain context. The first time the LLM handles a category of request, it does this kitting work live, discovering what it needs as it goes. That discovery is itself expensive constraint time.

Skill files are the kitting mechanism. A skill file encodes the preparation steps and domain knowledge for a category of work — what data sources to check, what schema to load, what conventions apply, what the user typically expects. When a skill file exists for the work at hand, the LLM arrives pre-kitted: context assembled, prerequisites loaded, ready to reason about the actual problem rather than spending capacity on preparation.

The LLM should write its own skill files. When the LLM does preparation work — discovers what tables to consult, what context to assemble, what conventions apply — it encodes that preparation as a skill file immediately, not after detecting a pattern. If the preparation recurs, the skill file is already there. If it never recurs, the skill file sits quietly — cheap to store, same as intents. The LLM wrote the instructions for its own future self.

Skill files are also how micro-apps are defined. A micro-app is not a separate abstraction — it is a set of skill files that together cover a complete operation from preparation through execution. As the LLM works, it writes skill files. Operations that accumulate complete skill file sets — covering data access, domain rules, output formatting, execution steps — are already micro-apps without anyone declaring them as such.

The LLM maintains a skill directory — a table (`gdd.skills`) that indexes all available skill files with their purpose, coverage, and when to use them. A table rather than a file because it simplifies editing over time and querying — the LLM inserts rows and runs queries against it rather than parsing and rewriting a manifest. The directory is the first thing the LLM consults when a request arrives, before loading any specific skill files. When the LLM writes a new skill file, it registers it in the directory.

The skill directory also serves as a registry of external agency — every capability the system can call on, whether it is a local skill file, an API endpoint, an Office tool via the xlsx/docx/pptx skills, or any tool reachable through an MCP connector. The directory tells the LLM what execution surfaces exist and how to reach them before it starts reasoning about the work.

The full arc from user ask to autonomous operation is one mechanism: the LLM writes skill files as it works. Recurring operations accumulate complete skill file sets. Those sets are the micro-apps. Granting a trigger and authorization to a micro-app makes it an agent. Powering a UI with a micro-app makes it a traditional application. The difference between an agent and an app is only the interface — an agent has a programmatic trigger, an app has a human-facing UI. A traditional application is an agent designed to be manipulated by human users. Skill files are the unit at every stage.

### Thinking nodes are blockers

Not every node in the graph requires thinking. `define-table` is mechanical — DDL. `translate` requires judgment. `signal` requires interpretation. The graph already encodes this through the type vocabulary and the three operations that require LLM injection (`transduceExternal`, `clientSession`, `translateRepresentation`).

A node that requires thinking is a point where deterministic execution stops. The graph can be executed mechanically — creating tables, inserting rows, wiring endpoints — until it reaches a node that needs judgment. That node is a blocker. It does not form a "thinking chain" with other thinking nodes. It is simply the boundary where automation yields to cognition.

This matters for agent design. An agent scoped to a subgraph that contains no thinking nodes can execute fully autonomously. An agent whose scope includes thinking nodes will stop at each one. The intelligence map of a graph is a projection: which nodes require thinking, and therefore where does deterministic execution halt. No new structure is needed — it is derivable from the type vocabulary.

### Execution surfaces

Any tool with an API or an MCP connector is both an execution surface and an interaction surface. An execution surface is a target the agent can produce output through — generating a spreadsheet via the xlsx skill, creating a Word document, pushing data to a dashboard. An interaction surface is a place where a human can reach the graph — querying intents, surfacing gaps, recording expressions from within their own tool.

A human working in Excel who asks a question through the MCP connector is a natural language actor who happens to be inside a spreadsheet. The LLM constructs the intent, the graph grows, the answer returns to Excel. The human never leaves their tool. The graph does not care where the ask came from.

This generalizes beyond Office. Any tool that can host an MCP connector or call an API becomes reachable. The skill directory lists them all. The skill file bundle is the same regardless of which surface it targets. The interface varies — chat, spreadsheet, web UI, scheduled trigger — but the mechanism is uniform.

Each connector has its own skill file covering setup and usage — what to install in the external tool, how to configure the MCP connection to the GDD server, what capabilities become available, and what the user needs to do on their end. The LLM walks the user through setup using the connector's skill file. These connector skill files are registered in `gdd.skills` like any other skill, so the system knows what connections are available and how to establish new ones.

The graph UI is where users compose both agents and applications from skill file bundles. Selecting a set of skills, assigning a trigger and authorization produces an agent. Selecting a set of skills and assigning a UI surface produces an application. The same composition mechanism serves both — the only difference is the interface. The connectors extend this composition to external tools: a user in Excel can interact with the graph directly, and the graph can push results back to Excel, without either side needing a separate integration layer.
