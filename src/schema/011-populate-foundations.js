const { pool } = require('../db');

// Foundations board: the rules that govern how intent graphs are built and operated.
// Each claim is the smallest independently-supersedable true statement from foundations.md.
// Descriptions carry examples and negative limits to help LLMs apply claims correctly.

const claims = [
  // === Context is structural, not reconstructed ===
  {
    id: 'found-structural-context',
    type: 'axiom',
    name: 'Context is structural, not reconstructed',
    notes: 'Context should be encoded in graph relationships, not reconstructed from memory each time work is picked up.',
    description: 'A task in a backlog carries no context -- every time you pick it up, you reconstruct what it depends on, what it enables, what was tried. An intent node carries its context structurally: dependencies are blocked-by edges, enablement is the reverse, "done" is the test condition, production is the expression, history is the supersession chain. Do not build systems that require actors to reconstruct context from external sources (Slack threads, meeting notes, wikis). If context lives outside the graph, it is lost context.'
  },
  {
    id: 'found-intent-context-encoding',
    type: 'axiom',
    name: 'Intent nodes encode context in their edges and fields',
    notes: 'An intent node\'s dependencies are its blocked-by edges; what it enables is the reverse; "done" is its test condition; what was produced is its expression; what was tried is its supersession chain.',
    description: 'Example: intent "op-create-board" has blocked-by edges to "table-boards", a test_condition saying what must be true, an expression node linking via satisfies edge with artifacts listing the source files, and if it were ever replaced, a supersedes edge from the replacement. All of this is queryable structure, not prose in a ticket. Do not add fields like "context", "background", or "notes-for-next-developer" -- the graph IS the context.'
  },

  // === Test-first at the architecture level ===
  {
    id: 'found-tdd-at-architecture',
    type: 'axiom',
    name: 'The intent graph is TDD at the architecture level',
    notes: 'The intent graph is TDD lifted from functions to intents -- the test condition IS the intent specification.',
    description: 'In XP, you write the test before the code. The test IS the specification. The intent graph applies the same discipline: the test condition says exactly what must be true, the expression only needs to satisfy the test. Example: test_condition "Table gdd.boards exists with columns: id, created_at, created_by, statement, status" is the specification for table-boards. The expression is the DDL that makes it true. Do not treat test conditions as optional documentation -- they are the contract.'
  },
  {
    id: 'found-green-requires-test-and-expression',
    type: 'axiom',
    name: 'Green requires both test condition and satisfying expression',
    notes: 'An intent cannot turn green without a test condition and a satisfying expression.',
    description: 'This is the fundamental invariant. No shortcut turns an intent green -- not "it looks done", not "we shipped it", not a status field set to "complete". Green means: a test condition exists AND an expression node is connected via a satisfies edge. Do not add alternative paths to green. Do not create "auto-green" mechanisms. If something is done but has no test, it is untested, not green.'
  },
  {
    id: 'found-uncollapsed-intents',
    type: 'axiom',
    name: 'Intents can exist before their test is articulable',
    notes: 'Recognition, production, test-writing, and satisfaction-claiming are independent reasoning acts that can happen in any order.',
    description: 'An untested/uncollapsed intent says "I know this needs to exist but I cannot yet say what done looks like." This is honest uncertainty, not sloppiness. Example: an LLM recognizes that "user authentication" is needed but cannot yet specify the test condition because the auth approach has not been decided. The intent exists, a gap may accompany it, and the test comes later. Do not force test conditions at creation time -- that produces fake precision. Do not treat untested intents as less real than tested ones -- they represent recognized need.'
  },
  {
    id: 'found-red-green-semantics',
    type: 'axiom',
    name: 'Red means unsatisfied, green means satisfied, untested stays red',
    notes: 'Red means no expression satisfies the intent; green means one does; untested stays red until a test is added.',
    description: 'Red/green is derived from graph topology, not stored as a status field. An intent is red when it has no incoming satisfies edge from an expression node. It is green when it does. An untested intent is red and will stay red until a test is added -- the graph honestly represents what it knows. Do not add a "yellow" or "in-progress" status. Do not add a "done" field. The topology IS the status.'
  },
  {
    id: 'found-whats-next-is-whats-red',
    type: 'axiom',
    name: '"What to do next" is "what\'s red"',
    notes: '"What to do next" is "what\'s red" -- same as in TDD.',
    description: 'In TDD, you run the test suite and work on what fails. In the intent graph, you run queryIncomplete and work on what is red. No backlog grooming, no sprint planning, no priority debate. The red intents ARE the work. Among them, the one that unblocks the most downstream work is highest leverage. Do not add task assignment, sprint containers, or work-in-progress limits to the core graph. The structure answers "what next" without process artifacts.'
  },
  {
    id: 'found-llm-manages-graph',
    type: 'axiom',
    name: 'The LLM manages the graph; the human prompts',
    notes: 'The LLM manages the graph autonomously; the human prompts, the LLM structures.',
    description: 'The human says what they want. The LLM translates that into graph operations -- creating intents, writing test conditions, recording expressions, creating edges. The human never needs to know the graph exists. Do not build UIs that require humans to manually create intents, write test conditions, or manage edges. The admin dashboard is for inspection, not for data entry. The LLM is the graph operator; the human is the director.'
  },

  // === The self-hosting proof ===
  {
    id: 'found-self-hosting',
    type: 'axiom',
    name: 'The system describes its own construction as its first act',
    notes: 'The layer intents in intent-graph-layers.md ARE the graph state the system starts from, not a tutorial.',
    description: 'When you implement Layer 0-7 intents, you are expressing intents that already exist in the representation you are building. This recursion validates the representation: the vocabulary is sufficient, the edge types capture real dependencies, the test conditions are articulable, the layers reflect actual build order. Do not create a separate specification language for the system. Do not maintain external documentation that diverges from graph state. If the graph cannot describe itself, the representation is insufficient.'
  },
  {
    id: 'found-self-hosting-proof',
    type: 'axiom',
    name: 'If the graph cannot represent its own construction, it cannot represent anything',
    notes: 'If the intent graph cannot represent the construction of an intent graph system, it cannot represent the construction of anything.',
    description: 'This is the litmus test for representational sufficiency. Any gap between the graph representation and the system it describes reveals a limitation in the vocabulary, edge types, or projection mechanisms. When you hit something the graph cannot express, that is a signal to extend the graph (new node type, new edge type), not to document it outside the graph.'
  },
  {
    id: 'found-readable-buildable',
    type: 'axiom',
    name: 'Any actor that can read the graph can build the system',
    notes: 'Any actor that can read the graph can build the system; any actor that can build the system can extend it.',
    description: 'The graph is the complete specification. An LLM reading the projection should have everything it needs to produce the expression. If it needs to consult external documentation, the graph is incomplete. Do not maintain knowledge outside the graph that is required to build or extend the system. Skill files are the current exception being addressed -- their contents should become graph state.'
  },
  {
    id: 'found-root-intent',
    type: 'decision',
    name: 'The root intent is the unmoved mover',
    notes: 'gdd-root exists before any graph operation creates it -- inserted during schema setup, outside the normal graph mechanism.',
    description: 'Self-hosting systems have a founding moment that precedes the rules they subsequently enforce. The root intent is that founding moment. It is inserted in bootstrap.sql, not via createIntent. This is documented rather than hidden. Do not try to make the root intent self-creating. Do not hide the bootstrap as an implementation detail. The honest acknowledgment of the founding moment is part of the system\'s integrity. Alternatives considered: self-referential creation (paradox), no root (orphan nodes), external manifest (breaks self-containment).'
  },

  // === The TOC lineage ===
  {
    id: 'found-constraint-is-topological',
    type: 'axiom',
    name: 'The constraint is the scope with the most queued red intents',
    notes: 'The constraint is the agent scope with the most queued red intents; the highest-leverage work unblocks the most downstream dependents.',
    description: 'This is Goldratt\'s Theory of Constraints applied topologically. In a factory, you find the constraint by observing the longest queue. In the graph, you find it by counting red intents per scope and measuring downstream fan-out. Example: if scope A has 12 red intents and scope B has 3, scope A is the constraint. Within scope A, the red intent with the most transitive downstream dependents is highest leverage. Do not add priority scores that override this structural ordering.'
  },
  {
    id: 'found-toc-separation',
    type: 'decision',
    name: 'Throughput accounting belongs in GDD-TOC, not the core graph',
    notes: 'Throughput accounting (dollar values, confidence-weighted prioritization) belongs in a separate application (GDD-TOC), not in the core graph.',
    description: 'The core graph provides the structural substrate: dependency chains, downstream counts, red/green state. Value assignment is a judgment that varies by stakeholder and context. Embedding it in the graph would couple structural truth to subjective valuation. Alternatives considered: priority fields on intents (rejected -- imposes external judgment), weight columns (rejected -- creates scoring that overrides structure), inline ROI (rejected -- conflates what exists with what it is worth).'
  },
  {
    id: 'found-critical-chain',
    type: 'axiom',
    name: 'The critical chain is the longest red blocked-by chain',
    notes: 'The critical chain is the longest chain of red intents where each is blocked-by the previous -- visible in the projection, not computed by a separate algorithm.',
    description: 'The critical chain is not a computed metric stored somewhere. It is readable from the graph\'s dependency structure. Walk the blocked-by edges from any red intent; the longest such walk is the critical chain. Buffer health is the rate of gaps appearing on the critical path versus the rate of red turning green. Do not build a separate critical path calculator. Do not store critical-chain membership as a field on intents. It is emergent from topology.'
  },
  {
    id: 'found-no-priority-fields',
    type: 'axiom',
    name: 'The core graph has no priority, urgency, or scheduling fields',
    notes: 'The core graph has no priority fields, urgency scores, scheduling algorithms, or throughput columns.',
    description: 'Every scoring mechanism added to the graph is an attempt to impose external judgment on a system that derives its own ordering from structure. Example of what not to do: adding a "priority" column to gdd.nodes, adding an "urgency" enum, creating a scheduling table that assigns intents to time slots, adding weight parameters to edges for priority routing. The dependency structure IS the prioritization. Do not add scoring that can contradict structural ordering.'
  },

  // === Constraints exist across topology ===
  {
    id: 'found-future-as-blocked-intents',
    type: 'axiom',
    name: 'The graph encodes the future as blocked intents',
    notes: 'A future chokepoint is already visible as an intent deep in the blocked chain with many downstream dependents.',
    description: 'Classical TOC is reactive -- you discover the constraint by observing where the queue is longest right now. The intent graph changes this: because the dependency structure is explicit, you can see that satisfying today\'s constraint will cause a specific downstream intent to become the next one. Example: intent X has 15 transitive dependents blocked behind it, but X itself is blocked by Y. When Y turns green, X becomes the new constraint. You can prepare for that now. Do not wait for bottlenecks to emerge -- the topology shows them in advance.'
  },
  {
    id: 'found-predictive-constraints',
    type: 'axiom',
    name: 'The graph supports predictive constraint identification',
    notes: 'The graph supports predictive constraint identification, not just reactive discovery.',
    description: 'An actor can see that satisfying today\'s constraint will shift the bottleneck to a specific downstream intent. It can prepare: reduce that future constraint\'s dependency depth, split it, pre-satisfy some of its blockers. Constraint migration is visible in the projection before it happens. Do not build a separate forecasting system for constraint prediction -- the topology already provides it.'
  },
  {
    id: 'found-topology-is-forecast',
    type: 'axiom',
    name: 'The topology of blocked intents is the structural forecast',
    notes: 'The topology of blocked intents IS a structural forecast -- no roadmap artifact needed.',
    description: 'There is no "future state" document. The "There is no future state" stance still holds -- no roadmap, no planned-state artifact. But blocked intents are what "the future" translates into. As present work satisfies dependencies, the future becomes present. queryIncomplete surfaces it. Do not create roadmap documents, timeline artifacts, or planned-state diagrams. The graph already contains this information as structure.'
  },

  // === Four primitives ===
  {
    id: 'found-four-primitives',
    type: 'axiom',
    name: 'Four semantic primitives underlie all artifacts',
    notes: 'Every artifact is a characteristic combination of Transduction (data crossing a context boundary), Resolution (ambiguity reduced), Boundary (inside/outside distinguished), and Trace (something that happened becomes recoverable).',
    description: 'These are compositional, not categorical. An order entry form is heavy Transduction (user input to database), contains Resolution (stock check, credit check), light Trace, minimal Boundary. A permissions screen is almost pure Boundary. A financial close report is heavy Trace, heavy Resolution, minimal Transduction. The primitive composition is what the artifact IS, structurally. Use these as a thinking tool when reasoning about what kind of work an intent represents.'
  },
  {
    id: 'found-primitives-not-stored',
    type: 'decision',
    name: 'Primitives are a conceptual lens, not stored fields',
    notes: 'The four primitives are not stored as computed fields in the core graph -- value estimation lives in GDD-TOC.',
    description: 'The dependency edges already surface structural impact: if an intent changes, everything downstream turns red. Adding primitive-composition scores to intents would create a parallel impact system that could contradict the structural one. The primitives remain useful for actors reasoning about what kind of work they are doing. Alternatives considered: primitive fields on nodes (rejected -- parallel scoring), computed primitive views (deferred to GDD-TOC), primitive-based routing (rejected -- overrides structural ordering).'
  },

  // === Dual representation ===
  {
    id: 'found-dual-representation',
    type: 'axiom',
    name: 'Human and LLM representations are both first-class projections',
    notes: 'The graph serves actors with fundamentally different cognitive needs -- human (narrative) and LLM (structure) -- both are first-class projections.',
    description: 'These are not two UIs for the same data. They are two representations designed for different cognitive architectures. The human needs narrative: what is done, what is next, what is blocked, what decisions were made. The LLM needs structure: full node data, edge types, test conditions, dependency chains -- dense, relational, navigable. Do not treat the human view as primary and the LLM view as a data dump. Do not treat the LLM view as primary and the human view as a simplified version. Both are shaped for their actor.'
  },
  {
    id: 'found-render-mechanics',
    type: 'axiom',
    name: 'renderHuman is deterministic formatting; renderLLM is direct serialization',
    notes: 'renderHuman is deterministic formatting of projection data; renderLLM is direct serialization; translateRepresentation bridges them with LLM doing human-to-graph and deterministic code doing graph-to-human.',
    description: 'The graph-to-human direction is deterministic -- no LLM needed, just formatting. The human-to-graph direction requires LLM judgment -- natural language to structured intent. Do not add LLM calls to renderHuman or renderLLM. Do not make graph-to-human lossy. The projection already has the data; rendering just shapes it for the reader.'
  },

  // === There is no future state ===
  {
    id: 'found-one-graph-present',
    type: 'axiom',
    name: 'There is one graph representing what exists now',
    notes: 'A red intent is a hole in the present, not a plan.',
    description: 'Most planning systems separate "where we are" from "where we are going." The intent graph has none of this. There is one graph. A red intent says "this needs to exist and does not yet." A green intent says "this exists and passes its test." Do not create separate "current state" and "desired state" views. Do not add a "planned" status to intents. A red intent is not planned work -- it is present absence.'
  },
  {
    id: 'found-future-is-everything-green',
    type: 'axiom',
    name: 'The future state is "everything green"',
    notes: 'Current and future are not separate things -- there is one world with holes in it, typed, testable, and dependency-ordered.',
    description: 'There is no bridge to build between current and future because they are not separate. The future IS the graph with all holes filled. Do not create milestone documents, phase gates, or future-state diagrams. If you need to communicate progress, project the ratio of green to total, or show the critical chain length over time. These are views of the one graph, not separate artifacts.'
  },
  {
    id: 'found-superseded-intents-remain',
    type: 'axiom',
    name: 'Superseded intents remain in the graph',
    notes: 'Current is derived from supersession structure -- an intent with no supersedes edge pointing at it is current.',
    description: 'The graph accumulates intention. Superseded intents are not deleted -- they are historical. "Current" is a query: intents with no incoming supersedes edge. The history is the topology, not a separate log. Example: if "op-create-board" is superseded by "op-create-board-v2", both exist in the graph. The v1 intent has an incoming supersedes edge from v2. Querying for current intents excludes v1 automatically. Do not delete superseded nodes. Do not add an "archived" status. Supersession structure IS the archive.'
  },
  {
    id: 'found-no-planning-artifacts',
    type: 'axiom',
    name: 'No planned status, no proposed intents, no want/have separation',
    notes: 'If something needs to exist, it is a red intent now. If you cannot articulate what it needs to be, it is a gap now.',
    description: 'Do not add: "planned" or "proposed" or "draft" statuses. Do not create a "backlog" container. Do not separate "what we want" from "what we have." Both exist in the present as typed nodes. A red intent is present need. A gap is present uncertainty. Do not defer intention to a separate planning layer.'
  },

  // === The plans, not the blueprint ===
  {
    id: 'found-plans-not-blueprint',
    type: 'axiom',
    name: 'The graph is the accumulated set of plans, not the house',
    notes: 'The house is projected from the plans. Every plan ever drawn remains in the set, but superseded plans are marked.',
    description: 'The graph is not the running system -- it is the complete record of intentions about the system. The running system is the house; the graph is every architectural drawing ever made, with superseded drawings marked as such. The current house is derived from the drawings that have not been superseded. Do not conflate the graph with the system it describes. The graph is the specification layer, the system is the expression layer.'
  },
  {
    id: 'found-supersession-not-removal',
    type: 'axiom',
    name: 'Intents are superseded via supersedes edges, not removed',
    notes: 'An intent that is no longer intended gets a supersedes edge from its replacement, not deletion.',
    description: 'Example: when edge_statement was removed from boards, the "table-boards" intent was not deleted. A new "table-boards-v2" intent was created with a supersedes edge pointing at the original. The original remains in the graph as history. Do not delete intents. Do not modify existing intents (test conditions are write-once). To change anything, create a new intent that supersedes the old one.'
  },
  {
    id: 'found-supersession-cascades-as-redness',
    type: 'axiom',
    name: 'Supersession cascades as redness, not deletion',
    notes: 'Downstream dependents turn red when upstream intent structure changes.',
    description: 'When an upstream intent is superseded, everything downstream that depended on it has its dependency structure changed. The red/green mechanism surfaces this impact naturally. Do not build cascading delete. Do not mark downstream intents as "invalidated." They turn red because their dependency changed -- the same mechanism that drives all work. The graph does not need a special impact analysis tool; red propagation IS impact analysis.'
  },
  {
    id: 'found-no-lifecycle-states',
    type: 'axiom',
    name: 'No draft mode, no review state, no approval workflow',
    notes: 'If an intent exists, it exists. If it has a test condition, it is a commitment.',
    description: 'Do not add: "draft" status (if you are not sure, create a gap instead), "in review" status (review is an expression -- someone looked at it and recorded what they found), "approved" status (approval is a decision node that closes a gap). Every lifecycle state you add is an attempt to make the graph track process rather than reality. If the process needs tracking, model it as intents and expressions within the graph.'
  },
  {
    id: 'found-status-is-topology',
    type: 'axiom',
    name: 'Red/green is derived from topology, not stored as a status field',
    notes: 'Red/green is derived from the presence or absence of satisfies edges, not stored as a status field.',
    description: 'An intent is red when it has no incoming satisfies edge from an expression node (and has a test condition). It is green when it does. This is computed by the projection, not stored on the node. Do not add a "status" column to gdd.nodes. Do not cache red/green state. Derive it every time from the edge structure. Caching creates the possibility of cache-topology disagreement, which is worse than recomputing.'
  },

  // === Graph reset, not pruning ===
  {
    id: 'found-write-only',
    type: 'axiom',
    name: 'The graph is write-only',
    notes: 'Superseded intents, closed gaps, historical decisions are never removed.',
    description: 'Write-only means: create and supersede, never delete or modify in place. This preserves the complete trajectory of intention. Example: the graph contains both "table-boards" (original, with edge_statement) and "table-boards-v2" (current, without edge_statement). Both are queryable. The history of how the system evolved is the graph itself, not a separate changelog. Do not add DELETE operations for nodes or edges. Do not add UPDATE operations that modify existing node content (except via supersession).'
  },
  {
    id: 'found-reset-not-pruning',
    type: 'axiom',
    name: 'When the graph is unwieldy, seed a new one -- do not prune',
    notes: 'Project the current state into a fresh graph and archive the old one whole.',
    description: 'Pruning contradicts write-only semantics and requires judgment about what to discard -- judgment that belongs in the graph as decisions, not in a maintenance operation. Do not build graph pruning, garbage collection, or cleanup operations. When the accumulated history outgrows utility, the response is: project current state (all non-superseded intents, edges, expressions), write to a new graph, archive the old one complete. The old graph is a closed ledger, not trash.'
  },
  {
    id: 'found-reset-mechanics',
    type: 'axiom',
    name: 'Graph reset uses the same projection as queryIncomplete',
    notes: 'Reset is: project current state, write to new graph, archive old one -- same projection logic as queryIncomplete, just a different destination.',
    description: 'No new logic is needed for graph reset. The projection that determines "current" (non-superseded, non-closed) is already built. Reset just writes that projection to a new graph and marks the old one as archived. Do not build a separate "what is current" algorithm for reset purposes. Use the existing projection.'
  },

  // === Completeness, not priority ===
  {
    id: 'found-structure-not-scores',
    type: 'axiom',
    name: '"What next" is answered by structure, not scores',
    notes: 'What is red? Among red intents, which unblocks the most downstream work? These are read from the graph, not computed by a scoring function.',
    description: 'The dependency structure IS the prioritization. The longest chain of red intents is the critical path. The scope with the most queued red intents is the constraint. No algorithm produces these -- they are visible in the projection. Do not add: priority fields, urgency indicators, weight parameters, sorting heuristics beyond downstream-dependent-count, Eisenhower matrices, MoSCoW labels, story points, or any other scoring mechanism.'
  },
  {
    id: 'found-tension-is-diagnostic',
    type: 'axiom',
    name: 'Tension and sensitivity readings are diagnostic instruments, not priority inputs',
    notes: 'Board-level tension_readings and edge-node sensitivity_readings are observational -- they do not assign scores to individual intents or change what "what\'s next" means.',
    description: 'Tension readings capture how much unresolved structural stress a board carries. Sensitivity readings capture drift or pressure at specific boundary points. Neither feeds into a priority algorithm. They are read alongside the graph, like a thermometer is read alongside a patient -- informative but not directive. Do not use tension readings to sort or rank intents. Do not build automated responses to tension levels. They inform the actor, the actor decides.'
  },

  // === Forecasts are projections ===
  {
    id: 'found-no-dates',
    type: 'axiom',
    name: 'The graph has no date fields on intents',
    notes: 'Forecasts are read-only projections of current pace over remaining structure.',
    description: 'Dates are predictions about execution time, and the graph does not model execution time. A forecast computes: given current velocity (expressions per unit time), how long does the remaining red subgraph take to clear? This is a view, not graph state. When velocity changes, the forecast changes. When intents are added, the forecast changes. Do not add: deadline columns, due_date fields, target_date on nodes, sprint end dates. If calendar views are needed, build them as read-only projections.'
  },
  {
    id: 'found-forecasts-in-human-view',
    type: 'decision',
    name: 'Forecasts belong in the human-legible representation, not in the graph',
    notes: 'Like renderHuman, forecasts read from the graph without writing to it.',
    description: 'The graph holds commitments (what must exist and how you know it is done). Forecasts are derived, not stored. They belong in renderHuman output or a separate forecast view. Alternatives considered: date fields on intents (rejected -- couples structural truth to temporal prediction), milestone nodes (rejected -- creates planning artifacts the graph avoids), velocity-adjusted priority (rejected -- mixes prediction with structure).'
  },

  // === Agents are inside the graph ===
  {
    id: 'found-agents-are-graph-state',
    type: 'axiom',
    name: 'Agents are graph state, not external actors',
    notes: 'Agent definitions live in gdd.agents -- scope is a projection, trust is a structural property, trigger is declarative graph state.',
    description: 'An agent does not interact with the graph from outside. It is inside the graph, reading what the graph lets it see (scope), writing what the graph lets it write (trust), activated when graph state changes in ways it declared interest in (trigger). Do not build: an orchestrator that manages agent lifecycle from outside the graph, a permissions layer that checks actions against an external policy, a message bus for agent-to-agent communication, a monitoring dashboard that watches agents from a privileged vantage point. All of these exist as graph operations.'
  },
  {
    id: 'found-coordination-through-graph',
    type: 'axiom',
    name: 'Agent coordination happens through the graph, not messages',
    notes: 'Agent A records an expression, Agent B\'s blocked intents become workable, B\'s trigger fires -- no message bus needed.',
    description: 'Example: Agent A is scoped to database intents, Agent B to API intents. Agent A satisfies "table-boards", which was blocking B\'s "op-create-board". B\'s event trigger fires because a dependency in its scope changed. No messages were passed. The dependency structure is the coordination mechanism. Do not build: pub/sub between agents, shared queues, agent communication protocols, or handoff mechanisms. The graph mediates all coordination.'
  },
  {
    id: 'found-oversight-through-graph',
    type: 'axiom',
    name: 'Agent oversight happens through the graph, not separate monitoring',
    notes: 'An agent\'s work is visible as the nodes, edges, and expressions it created; gaps surface to whoever defined the agent.',
    description: 'If an agent gets stuck, it creates a gap. That gap is visible to whoever defined the agent through the same queryIncomplete they use for their own work. There is no separate monitoring channel because the graph IS the monitoring channel. Do not build: agent dashboards separate from the graph dashboard, agent log files, agent health checks external to graph state, or agent-specific alerting systems. If you want to monitor an agent, query the graph for nodes it created.'
  },

  // === The andon cord is universal ===
  {
    id: 'found-andon-cord',
    type: 'axiom',
    name: 'Any actor discovering a blocker must surface it as a gap or untested intent',
    notes: 'If the actor cannot articulate a test condition, it creates an untested intent (need clear, not evaluable) or a gap (more fundamental blocker), recording what it knows in notes.',
    description: 'Named after Toyota\'s andon cord -- any worker can stop the line when they see a problem. In the graph, any actor (human, agent, client) that encounters something wrong creates a gap or untested intent. The gap IS the incompleteness -- no actor-attribution metadata is needed because the content carries the perspective. Do not build: error reporting systems separate from the graph, bug trackers alongside the graph, incident management outside the graph. Blockers are gaps; gaps are graph state.'
  },
  {
    id: 'found-andon-expression-confidence',
    type: 'axiom',
    name: 'The andon cord applies to expression confidence, not just test articulability',
    notes: 'If multiple approaches satisfy the test and the choice between them matters, create a gap rather than guessing.',
    description: 'Example: test condition says "users can log in with email." Both OAuth and magic links satisfy this. If the choice matters (security posture, UX, maintenance burden), the right action is to create a gap naming the alternatives, not to pick one silently. A system that never produces gaps is not ambiguity-free -- it is hiding ambiguity inside silent choices. Do not build agents that always pick the first viable approach. Build agents that create gaps when the choice is non-obvious.'
  },
  {
    id: 'found-gaps-are-honest',
    type: 'axiom',
    name: 'A system that never produces gaps is hiding its ambiguity',
    notes: 'A gap is the boundary between what is articulable and what is not, with the articulable part preserved.',
    description: 'Gaps are not failures. They are the system being honest about what it does not know. An agent that creates zero gaps is not more capable -- it is less trustworthy, because it is making choices without surfacing them. Example: a gap "Authentication approach: OAuth vs magic links -- affects security posture and session management" is more valuable than silently picking OAuth. Do not penalize agents for creating gaps. Do not measure agent quality by gap count (lower is not better).'
  },
  {
    id: 'found-decision-gap-lifecycle',
    type: 'axiom',
    name: 'Decisions close gaps; expressions complete the lifecycle',
    notes: 'A decision records what was chosen and what alternatives were considered. A closes edge marks gap resolution. An expression with a satisfies edge completes it.',
    description: 'The full lifecycle: (1) gap created -- blocker identified, (2) decision created -- choice made with alternatives recorded, closes edge to gap, (3) expression created -- work done implementing the decision, satisfies edge to the gap. The gap is now green: it has a test (implicit from the gap statement), a decision (how it was resolved), and an expression (what was produced). Do not short-circuit this lifecycle. Do not close gaps without decisions. Do not skip expression recording after decision.'
  },

  // === The dark fraction ===
  {
    id: 'found-dark-fraction',
    type: 'axiom',
    name: 'Boundary coherence degrades geometrically with scale',
    notes: 'The Dark Fraction Theorem proves that the fraction of configurations no within-system diagnostic can reach goes to 1 as shared boundary variables grow.',
    description: 'Each shared variable at a system boundary carries three independently driftable facets -- Meaning, Structure, and Context. As variables grow, the unverifiable configuration space grows geometrically. This is not an engineering shortcoming to be solved with better tooling. It is a geometric property. Do not build systems that claim to verify all boundary configurations. Do not treat boundary failures as bugs -- they are the dark fraction manifesting. Design for graceful handling of unverifiable states.'
  },
  {
    id: 'found-dark-fraction-structural',
    type: 'axiom',
    name: 'The system makes unverifiable configurations structural, not invisible',
    notes: 'Gap nodes register the dark fraction where encountered; signal nodes capture drift before interpretation; edge nodes mark boundaries where verification ends.',
    description: 'The system does not claim to eliminate unverifiable configurations. It makes them visible. When a boundary configuration cannot be verified, an edge node marks that boundary. When drift is observed before it is interpreted, a signal node captures it. When incompleteness is discovered, a gap node registers it. The dark fraction is present in every system; GDD makes it structural rather than hiding it in optimistic assumptions.'
  },
  {
    id: 'found-edge-nodes-concrete',
    type: 'axiom',
    name: 'Edge nodes are a concrete subsystem with conversion/expansion lifecycle',
    notes: 'The gdd.edge_nodes table stores boundary-point entities; conversion transduces external signals into edge nodes; expansion unpacks them into operational elements when context accumulates.',
    description: 'Edge nodes are not just conceptual markers -- they have a table (gdd.edge_nodes), a lifecycle (active, expanded, converted), and readings (sensitivity_readings). Conversion: an external signal is transduced into an edge node at a system boundary. Expansion: an edge node is unpacked into operational graph elements when enough context accumulates to interpret it. Sensitivity readings attach to edge nodes, recording drift signals at the boundaries they mark. Do not treat edge nodes as annotations. They are first-class entities with their own operations.'
  },

  // === The loop is the loop ===
  {
    id: 'found-universal-loop',
    type: 'axiom',
    name: 'Every actor runs the same loop: red, project, work, andon, green',
    notes: 'Find what is red, read the projection, work (create nodes/edges/expressions), pull the andon cord if stuck, watch the graph turn green.',
    description: 'Humans run this loop. Agents run this loop. Clients run this loop (transduced through clientSession). External forces run this loop (transduced through transduceExternal, landing as signal nodes first). There is no special agent protocol, no human workflow, no client pipeline. Do not create separate code paths for different actor types. The operations are the same. Actor differences are captured by scope and trust constraints. The loop does not branch on who is running it.'
  },
  {
    id: 'found-actor-differences',
    type: 'axiom',
    name: 'Actor differences are entry method, scope, and trust -- not the loop',
    notes: 'How they enter (directly or transduced), what they see (scope), and what they can write (trust) -- these are the only differences.',
    description: 'A human enters directly via the dashboard or natural language. A client enters transduced through clientSession. An external force enters as a signal node via transduceExternal. An agent enters triggered by graph state change. All then run the same loop. Do not build actor-specific operation sets. Do not build human-only or agent-only APIs. The same operations serve all actors; scope and trust constrain what each can do.'
  },
  {
    id: 'found-signals-as-entry',
    type: 'axiom',
    name: 'External forces enter as signal nodes before interpretation',
    notes: 'Signal nodes are the graph\'s write surface for the environment -- they land first, then get interpreted into operational elements.',
    description: 'When something external happens (a deployment fails, a customer complains, a dependency is deprecated), it enters the graph as a signal node. The signal captures the raw observation. Then an actor (human or LLM) interprets the signal into operational graph elements: intents, gaps, decisions. Do not skip the signal step. Do not have external events directly create intents. The signal preserves the original observation before interpretation colors it.'
  },

  // === The LLM constructs the intent ===
  {
    id: 'found-llm-constructs-intent',
    type: 'axiom',
    name: 'The LLM infers intent structure from natural language asks',
    notes: 'When a human asks for something, the LLM constructs the intent -- name, type, test condition, expression -- all inferred from the ask.',
    description: 'The user says "what were yesterday\'s sales." The LLM: (1) creates an intent "get-yesterday-sales" with type and test condition, (2) does the work (queries the data), (3) records the expression with the result, (4) links expression to intent via satisfies edge. The user never sees the graph machinery. Do not build UIs that require humans to fill out intent forms. The LLM earning its cost means translating natural language to structured graph operations.'
  },
  {
    id: 'found-intent-enters-satisfied',
    type: 'axiom',
    name: 'Intents from user asks enter fully formed and already satisfied',
    notes: 'The user got their answer, the graph got a new node, neither waited for the other.',
    description: 'For ad-hoc user requests, the intent is created and satisfied in one operation. The user does not wait for the graph to process the intent. The graph does not wait for the user to approve the intent. Both happen atomically. Do not build an approval queue between user asks and intent creation. Do not make the user confirm the intent structure before the LLM acts on it. The graph grows silently in the background of normal work.'
  },
  {
    id: 'found-every-intent-worth-keeping',
    type: 'axiom',
    name: 'Every expressed intent is worth keeping',
    notes: 'It represents expensive-to-produce understanding that is cheap to store.',
    description: 'The LLM did work to understand the ask, figure out how to do it, and produce a result. That understanding is expensive to produce (LLM call) and cheap to store (a few rows in postgres). Do not garbage-collect old intents. Do not expire intents after a time period. Do not treat ad-hoc intents as less valuable than planned ones. Over time, the accumulated intents become the system\'s operational memory -- what it has been asked to do and how it did it.'
  },
  {
    id: 'found-recurring-intents-become-microapps',
    type: 'axiom',
    name: 'Recurring intents can be promoted to deterministic micro-apps',
    notes: 'Pattern detection identifies recurring intents; similarity search offers prior solutions; micro-apps run without LLM involvement.',
    description: 'When the same kind of ask recurs (daily sales report, weekly status, standard deployment), the accumulated intents reveal the pattern. A skill file can encode the pattern, and the operation becomes deterministic -- no LLM call needed. This is not premature optimization; it is the natural lifecycle of operational knowledge: ad-hoc ask, LLM-mediated intent, accumulated pattern, skill file, deterministic micro-app. Do not try to predict which intents will recur. Let the graph accumulate and the patterns emerge.'
  },

  // === Consistency is not a goal ===
  {
    id: 'found-semantic-consistency-not-enforced',
    type: 'axiom',
    name: 'Semantic consistency (naming, description style) is not enforced',
    notes: 'The LLM reasons by meaning, not naming convention -- "get-yesterday-sales" and "fetch daily revenue summary" can coexist.',
    description: 'Consistency is a human readability concern. Humans need clean taxonomies because they cannot hold a thousand intents in working memory. The LLM can navigate heterogeneous naming and recognize semantic relationships without reconciliation. Do not add: naming convention enforcement, style guides, linting rules for intent names, review steps for label consistency. The only way to guarantee consistency would be big design up front, which contradicts emergent structure.'
  },
  {
    id: 'found-structural-consistency-enforced',
    type: 'axiom',
    name: 'Structural consistency IS enforced',
    notes: 'Intent types must come from the fixed vocabulary; edge types must be one of the defined set; graph operations depend on correct classification.',
    description: 'The LLM can name an intent however it likes, but it must classify it correctly. Example: type must be one of the gdd.node_type enum values. Edge type must be one of the 7 defined types. These are enforced by the schema and operations. Do not relax structural constraints to accommodate edge cases. Do not add "other" or "custom" to type enums. If a new type is needed, add it to the enum through proper graph evolution (new intent, decision, expression).'
  },
  {
    id: 'found-structure-serves-llm-views-serve-human',
    type: 'axiom',
    name: 'The structure serves the LLM; the views serve the human',
    notes: 'Presentation is a view, not the structure. The LLM navigates the raw graph; humans see rendered projections.',
    description: 'If a human wants to inspect the graph, the LLM renders it in whatever organized form the human finds useful -- grouped by domain, sorted by recency, filtered by status. The presentation is a view, not the structure. Do not restructure the graph to make it human-readable. Do not simplify the graph for human consumption. Build better views instead. The graph optimizes for LLM reasoning effectiveness; renderHuman optimizes for human comprehension.'
  },

  // === Full kitting at the constraint ===
  {
    id: 'found-llm-is-constraint',
    type: 'axiom',
    name: 'The LLM is the constraint -- never waste its capacity on prerequisites',
    notes: 'Goldratt\'s full kitting: everything the constraint needs should be assembled before it starts working.',
    description: 'In TOC, the constraint is the bottleneck that limits total throughput. The LLM is expensive per call and limited in throughput. Full kitting means: never let the LLM spend its capacity loading schema, finding prior intents, discovering data sources. All that should be assembled before the LLM reasons about the actual problem. Do not build LLM interactions that start with "let me look up..." -- the kitting should already be done.'
  },
  {
    id: 'found-skill-files-are-kitting',
    type: 'axiom',
    name: 'Skill files are the kitting mechanism',
    notes: 'A skill file encodes preparation steps and domain knowledge so the LLM arrives pre-kitted -- context assembled, prerequisites loaded.',
    description: 'Example: a skill file for "daily sales report" encodes: which tables to query, what date format the user prefers, what output format to use, what edge cases exist. When a user asks for a sales report, the skill file is loaded first, and the LLM reasons about the specific request with all context pre-assembled. Without the skill file, the LLM spends constraint capacity on preparation. With it, the LLM spends constraint capacity on the actual problem.'
  },
  {
    id: 'found-llm-writes-own-skills',
    type: 'axiom',
    name: 'The LLM writes its own skill files on first encounter',
    notes: 'Skill files are written immediately when preparation work is done, not after detecting a pattern.',
    description: 'When the LLM discovers what tables to consult, what context to assemble, what conventions apply, it encodes that preparation as a skill file immediately. Not "after the third time" -- immediately. If the preparation recurs, the skill file is already there. If it never recurs, the skill file sits quietly. Cheap to store. The LLM is writing instructions for its own future self. Do not add heuristics for when to create skill files. Always create them. The cost of an unused skill file is negligible.'
  },
  {
    id: 'found-microapp-is-skill-set',
    type: 'axiom',
    name: 'A micro-app is a set of skill files covering a complete operation',
    notes: 'Not a separate abstraction -- operations that accumulate complete skill file sets are already micro-apps without anyone declaring them.',
    description: 'As the LLM works, it writes skill files. Operations that accumulate complete coverage -- data access, domain rules, output formatting, execution steps -- are already micro-apps. Do not create a separate "micro-app" entity type. Do not build a micro-app registry distinct from the skill directory. A micro-app is just the emergent property of complete skill file coverage for an operation.'
  },
  {
    id: 'found-skill-directory',
    type: 'axiom',
    name: 'The skill directory (gdd.skills) indexes all capabilities',
    notes: 'Local skill files, API endpoints, MCP connectors -- all registered in gdd.skills and consulted before every request.',
    description: 'The skill directory is the first thing the LLM consults when a request arrives. It lists every execution surface, every prepared operation, every connector. When the LLM writes a new skill file, it registers it in the directory. Do not build separate registries for different capability types. The skill directory is the single source of "what can this system do." It is a table (not a file) because tables simplify querying and editing over time.'
  },
  {
    id: 'found-skill-to-agent-arc',
    type: 'axiom',
    name: 'The arc from ask to agent is one mechanism: skill file accumulation',
    notes: 'LLM writes skill files, recurring operations accumulate complete sets, those sets are micro-apps, adding a trigger makes an agent, adding a UI makes an application.',
    description: 'There is no point where someone declares "this is now an agent" or "this is now an app." The transition is continuous: ad-hoc ask produces skill files, skill files accumulate into micro-app, micro-app plus trigger equals agent, micro-app plus UI equals application. A traditional application is an agent designed to be manipulated by human users. The difference between agent and app is only the interface. Do not build separate frameworks for agent creation and application creation. They are the same mechanism with different triggers.'
  },

  // === Thinking nodes are blockers ===
  {
    id: 'found-thinking-nodes-block',
    type: 'axiom',
    name: 'A node requiring judgment is where deterministic execution stops',
    notes: 'It is a blocker -- the boundary where automation yields to cognition -- not part of a "thinking chain."',
    description: 'Some nodes are mechanical: define-table is DDL, pure automation. Others require judgment: translate needs interpretation, signal needs assessment. A thinking node does not form a sequence with other thinking nodes. It is simply where the automated pipeline stops and waits for cognition. The intelligence map of a graph is derivable from the type vocabulary -- no new structure needed. Do not build "thinking chains" or "reasoning pipelines" as graph structures. Each thinking node is an independent blocker.'
  },
  {
    id: 'found-autonomous-subgraphs',
    type: 'axiom',
    name: 'An agent scoped to a no-thinking-nodes subgraph is fully autonomous',
    notes: 'Thinking nodes are where automation yields to cognition -- if none exist in scope, the agent never stops.',
    description: 'This is how you reason about agent trust and scope. If you scope an agent to a subgraph containing only mechanical nodes (define-table, implement-operation with clear test conditions), it can execute without any human intervention. If the subgraph contains thinking nodes, the agent will stop at each one. Do not build "autonomy levels" as agent configuration. Autonomy is emergent from the relationship between the agent\'s scope and the thinking-node distribution in that scope.'
  },

  // === Execution surfaces ===
  {
    id: 'found-execution-interaction-surfaces',
    type: 'axiom',
    name: 'Any tool with API or MCP connector is both execution and interaction surface',
    notes: 'Execution surface: system targets it for output. Interaction surface: human reaches the graph through it.',
    description: 'Example: Excel with MCP connector. As an execution surface, the system generates spreadsheets and pushes them to Excel. As an interaction surface, a human in Excel asks a question through the MCP connector and the LLM constructs the intent. The human never leaves their tool. The graph does not care where the ask came from. Do not build tool-specific integration layers. The MCP connector and skill file mechanism is uniform across all tools.'
  },
  {
    id: 'found-connector-skill-files',
    type: 'axiom',
    name: 'Each connector has its own skill file registered in gdd.skills',
    notes: 'Covers setup, configuration, capabilities, and what the user needs to do on their end.',
    description: 'The LLM walks the user through connector setup using the connector\'s skill file. These skill files are registered in gdd.skills like any other skill, so the system knows what connections are available and how to establish new ones. Do not hard-code connector setup in application code. Do not maintain connector documentation outside the skill directory. The skill file IS the connector documentation, and it is queryable.'
  },
  {
    id: 'found-agent-vs-app-is-interface',
    type: 'axiom',
    name: 'Agent vs application is only the interface',
    notes: 'Agent has a programmatic trigger; application has a human-facing UI. A traditional application is an agent designed to be manipulated by human users.',
    description: 'The same skill file bundle can be triggered programmatically (agent) or presented through a UI (application). The composition mechanism is the same. Do not build separate systems for agent management and application management. Do not treat agents as more sophisticated than applications or vice versa. They are the same thing with different activation mechanisms.'
  },
];

async function populate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Create the foundations board
    console.log('Creating foundations board...');
    await client.query(`
      INSERT INTO gdd.boards (id, created_by, statement)
      VALUES ('foundations', 'system', 'The rules that govern how intent graphs are built and operated -- the intellectual commitments and building stances that precede design.')
      ON CONFLICT (id) DO NOTHING
    `);

    // Insert all claims as axiom/decision nodes on the foundations board
    let inserted = 0;
    for (const claim of claims) {
      const result = await client.query(`
        INSERT INTO gdd.nodes (id, type, name, notes, description, board_id)
        VALUES ($1, $2, $3, $4, $5, 'foundations')
        ON CONFLICT (id) DO NOTHING
      `, [claim.id, claim.type, claim.name, claim.notes, claim.description]);
      if (result.rowCount > 0) inserted++;
    }
    console.log(`Inserted ${inserted} of ${claims.length} claims.`);

    await client.query('COMMIT');

    // Summary
    const boardCount = await client.query(`SELECT COUNT(*) FROM gdd.boards`);
    const foundClaims = await client.query(`SELECT COUNT(*) FROM gdd.nodes WHERE board_id = 'foundations'`);
    const byType = await client.query(`SELECT type, COUNT(*) FROM gdd.nodes WHERE board_id = 'foundations' GROUP BY type ORDER BY type`);
    console.log(`\nBoards: ${boardCount.rows[0].count}`);
    console.log(`Foundations claims: ${foundClaims.rows[0].count}`);
    byType.rows.forEach(r => console.log(`  ${r.type}: ${r.count}`));

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Population failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

populate();
