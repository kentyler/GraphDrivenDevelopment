const { pool } = require('../db');

// Spec claims: atomic decomposition of all skill files EXCEPT foundations.md (already in 011).
// Prefixed 'spec-' to distinguish from 'found-' foundations claims.
// All live on the 'foundations' board alongside the 'found-' claims.

const claims = [
  // ========================================================================
  // intent-graph.md: Node structure, edge types, test tiers, build conventions
  // ========================================================================

  // --- Node structure ---
  {
    id: 'spec-node-fields',
    type: 'axiom',
    name: 'Node structure has exactly nine fields',
    notes: 'Every node has: id (text PK), type (node_type enum), name (text NOT NULL), description (text nullable), test_condition (text nullable), test_verification (text nullable), notes (text nullable), artifacts (jsonb nullable), board_id (text FK nullable). No created_at, no created_by, no status column.',
    description: 'Verified against gdd.nodes: 9 columns exactly as specified. The absence of created_at, created_by, and status is intentional -- provenance lives on edges (created_by), timing is not tracked on nodes, and status is derived from topology. Do not add temporal or status columns to the nodes table.'
  },
  {
    id: 'spec-node-type-vocabulary',
    type: 'decision',
    name: 'The node type vocabulary is a fixed 21-value enum',
    notes: 'gdd.node_type has exactly 21 values: 3 schema types (define-table, define-type, define-schema), 5 operation types (implement-operation, implement-endpoint, implement-traversal, implement-projection, implement-mutation), 3 integration types (integrate, derive, translate), 2 constraint types (constrain-permission, constrain-invariant), 3 structural types (establish-convention, define-vocabulary, compose), and 5 special types (gap, decision, signal, expression, axiom).',
    description: 'Verified: all 21 values present in the database enum. The vocabulary is closed -- "use gap for anything that does not fit." Do not add new types without going through graph evolution (new intent, decision, expression). Alternatives considered: open-ended types (rejected -- type proliferation defeats structural consistency), fewer types (rejected -- loses semantic precision that operations depend on).'
  },
  {
    id: 'spec-edge-type-vocabulary',
    type: 'decision',
    name: 'The edge type vocabulary is a fixed 7-value enum',
    notes: 'gdd.edge_type has exactly 7 values: blocked-by (dependency), contains (composition), tensions-with (mutual tension), refines (specialization), supersedes (replacement), closes (decision resolves gap), satisfies (expression satisfies intent).',
    description: 'Verified: all 7 values in the database enum. Current usage: blocked-by (115), contains (76), satisfies (55), supersedes (4), refines (2). No closes or tensions-with edges exist yet -- these are valid but unused edge types. Each edge type has a defined direction and semantics.'
  },

  // --- Test condition tiers ---
  {
    id: 'spec-tier-a-executable',
    type: 'axiom',
    name: 'Tier A tests are executable -- mechanically runnable with deterministic results',
    notes: 'Tier A tests can be run without judgment: a SQL query returning expected rows, an API endpoint returning a specific response, an assertion passing. Deterministic and automatable.',
    description: 'Examples: "SELECT * FROM information_schema.columns WHERE table_schema=gdd AND table_name=nodes", "POST /api/intents returns 201 with valid node structure". Most Layer 0 and Layer 1 intents are tier A. Prefer tier A wherever possible.'
  },
  {
    id: 'spec-tier-b-inspectable',
    type: 'axiom',
    name: 'Tier B tests are inspectable -- objective but not single-query',
    notes: 'Tier B tests require examining structure or output, but the check is objective: a file exists, a column is present, an endpoint is reachable.',
    description: 'Examples: "The dashboard loads and displays red intents", "The projection includes all blocked-by edges for the target intent". A test that looks like tier C but could be tier A is underspecified -- sharpen it.'
  },
  {
    id: 'spec-tier-c-semantic',
    type: 'axiom',
    name: 'Tier C tests require judgment -- reserved for LLM-dependent operations',
    notes: 'Tier C tests require judgment: LLM output is coherent, projection is useful, natural language intake produces reasonable graph mutations. Cannot be fully automated.',
    description: 'Examples: "clientSession produces valid graph mutations that capture user intent", "renderHuman produces a narrative a human can act on". Reserve tier C for transduction, translation, and client intake. A test that looks like tier C but could be tier A is underspecified.'
  },

  // --- Key fields and populate-time shorthand ---
  {
    id: 'spec-key-fields-authoring-only',
    type: 'decision',
    name: 'Key fields are an authoring format, not database columns',
    notes: 'Fields like table_name, operation_name, values, children, blocked_by in the intent JSON blocks are reading aids. They are not columns in gdd.nodes. Essential information goes in name, description, and test_condition.',
    description: 'This prevents the nodes table from accumulating type-specific columns. A define-table intent encodes its table_name in its description. A compose intent encodes its children as contains edges. The JSON blocks are population instructions, not schema definitions.'
  },
  {
    id: 'spec-populate-children-to-contains',
    type: 'decision',
    name: 'Populate-time shorthand: children array becomes contains edges',
    notes: 'When a compose node carries a "children" array, the builder creates contains edges (compose -> each child) in gdd.edges. The children field does not appear on the node itself.',
    description: 'Verified: 76 contains edges exist in the database. Example: gdd-root has children listed in its JSON block; the builder created contains edges from gdd-root to each child.'
  },
  {
    id: 'spec-populate-blocked-by-to-edges',
    type: 'decision',
    name: 'Populate-time shorthand: blocked_by array becomes blocked-by edges',
    notes: 'When an intent carries a "blocked_by" array, the builder creates blocked-by edges (intent -> each dependency) in gdd.edges. The blocked_by field does not appear on the node itself.',
    description: 'Verified: 115 blocked-by edges exist in the database. Similarly, test.condition maps to test_condition column and test.verification maps to test_verification column.'
  },

  // --- Edge semantics ---
  {
    id: 'spec-blocked-by-bidirectional-read',
    type: 'axiom',
    name: 'blocked-by edges are traversable in both directions',
    notes: 'Forward: "what blocks me" (follow blocked-by from vantage to dependencies). Reverse: "what do I unblock" (follow blocked-by in reverse to find dependents). Both are meaningful for projection.',
    description: 'traverseDependencies walks upstream (forward from vantage) and downstream (reverse). Workability = all blocked-by targets are green.'
  },
  {
    id: 'spec-contains-structural-test',
    type: 'axiom',
    name: 'Compose nodes have a structural test: all contains children green',
    notes: 'A compose node is green when every node it contains is satisfied. No hand-written test condition needed.',
    description: 'Compose nodes are excluded from queryIncomplete. Their greenness is computed by checking whether all child nodes (via contains edges) have incoming satisfies edges. Verified in queryIncomplete.js.'
  },
  {
    id: 'spec-tensions-with-no-direction',
    type: 'axiom',
    name: 'tensions-with edges have no prescribed direction',
    notes: 'tensions-with edges go in either direction between two intents that pull in different directions.',
    description: 'No tensions-with edges exist in the built system yet. They surface tradeoffs in projections but do not affect red/green status.'
  },
  {
    id: 'spec-refines-specific-to-general',
    type: 'axiom',
    name: 'refines edges go from specific to general',
    notes: 'A refines edge connects a more specific intent to its general counterpart. Direction: specific -> general.',
    description: 'Verified: 2 refines edges exist in the database.'
  },
  {
    id: 'spec-closes-many-to-many',
    type: 'axiom',
    name: 'closes edges are many-to-many between decisions and gaps',
    notes: 'One decision can close multiple gaps, and a gap can be closed by multiple decisions. Direction: decision -> gap.',
    description: 'No closes edges exist yet. The closes edge records why a gap was resolved. Paired with a satisfies edge from an expression to turn the gap green.'
  },
  {
    id: 'spec-satisfies-many-to-many',
    type: 'axiom',
    name: 'satisfies edges are many-to-many between expressions and intents',
    notes: 'One expression can satisfy multiple intents (shared implementation). One intent can be satisfied by multiple expressions. Direction: expression -> intent.',
    description: 'Verified: 55 satisfies edges exist. The satisfies edge turns intents green. An intent with at least one incoming satisfies edge from an unsuperseded expression is green.'
  },
  {
    id: 'spec-supersedes-new-to-old',
    type: 'axiom',
    name: 'supersedes edges go from new to old',
    notes: 'Direction: replacement -> replaced. "I supersede you" as an outgoing edge from the new node. Current intent = no incoming supersedes edge.',
    description: 'Verified: 4 supersedes edges exist. The old intent remains in the graph as history.'
  },
  {
    id: 'spec-closes-decision-to-gap',
    type: 'axiom',
    name: 'closes edges go from decision to gap',
    notes: 'Direction: decision -> gap. The full gap lifecycle: gap created, decision with closes edge, expression with satisfies edge to gap. All three nodes remain.',
    description: 'The closes edge records why the gap was resolved. The satisfies edge records that resolution is complete.'
  },

  // --- Edge provenance and supersession ---
  {
    id: 'spec-edge-provenance',
    type: 'axiom',
    name: 'Edges carry optional description and created_by fields',
    notes: 'Edge description records rationale. Edge created_by records provenance. Both are nullable text columns on gdd.edges.',
    description: 'Unlike nodes, edges do track provenance via created_by. This asymmetry is intentional -- edge creation is an interpretive act worth attributing. Verified in database schema.'
  },
  {
    id: 'spec-edge-supersession',
    type: 'decision',
    name: 'Edges are supersedable via superseded_by column',
    notes: 'When an edge is wrong, supersedeEdge creates a replacement and sets superseded_by on the old one atomically. Superseded edges remain as history. Current edges have superseded_by IS NULL.',
    description: 'Under write-only semantics, wrong edges cannot be deleted. The replacement can change any field -- from_node, to_node, edge_type, description. Projections filter to superseded_by IS NULL. Verified in edges table schema and buildProjection.js.'
  },

  // --- Write-once test conditions ---
  {
    id: 'spec-test-condition-write-once',
    type: 'decision',
    name: 'Test conditions are write-once -- immutable once set',
    notes: 'setTestCondition adds a test to an untested intent. Once set, the test is immutable. To change a test, supersede the intent.',
    description: 'This enforces legibility: every expression was recorded against the exact test still visible on the intent. Verified: setTestCondition.js rejects if test_condition is already set. Do not allow test condition mutation.'
  },
  {
    id: 'spec-untested-permanently-red',
    type: 'axiom',
    name: 'An untested intent is permanently red until a test is added',
    notes: 'An intent without test_condition cannot turn green. The projection surfaces has_test: false so actors can distinguish "needs work" from "needs a test first."',
    description: 'Verified: queryIncomplete.js computes has_test on every returned row. Actors see this flag and know the intent needs a test before it can accept expressions.'
  },

  // --- Unlinked expressions ---
  {
    id: 'spec-unlinked-expressions',
    type: 'decision',
    name: 'Expressions can exist without satisfies edges (unlinked)',
    notes: 'An unlinked expression records production without claiming satisfaction. linkExpression connects it later. Queryable via queryUnlinked (GET /api/unlinked).',
    description: 'Supports the epistemic model: production and satisfaction-claiming are independent reasoning acts. queryUnlinked finds expression nodes with no outgoing satisfies edges and no incoming supersedes edges. Verified in queryUnlinked.js.'
  },

  // --- Node type specifics ---
  {
    id: 'spec-expression-neither-red-nor-green',
    type: 'axiom',
    name: 'Expression nodes are neither red nor green and excluded from queryIncomplete',
    notes: 'Expressions are artifacts, not requirements. They connect to intents via satisfies edges, determining which intents are green. They carry artifacts (JSONB) but no test_condition.',
    description: 'Verified: queryIncomplete excludes expression (and compose, decision, signal, axiom). Expression nodes require artifacts JSONB as a semantic requirement enforced by recordExpression.'
  },
  {
    id: 'spec-gap-notes-required',
    type: 'axiom',
    name: 'Gap nodes require notes recording everything the actor knows',
    notes: 'Gap notes must capture: what was encountered, what made the test condition unarticulable, what needs resolution. The gap is the boundary between articulable and not, with the articulable part preserved.',
    description: 'Do not create empty gaps. The notes field is nullable at the DB level but semantically required for gaps.'
  },
  {
    id: 'spec-decision-notes-required',
    type: 'axiom',
    name: 'Decision nodes require notes recording alternatives considered',
    notes: 'Decision notes must capture: what was chosen, alternatives considered, scope governed, reasoning. A decision without alternatives is an assertion, not a decision.',
    description: 'Verified: 6 decision nodes exist in the database. Decisions are authored closures paired with closes edges to gaps.'
  },
  {
    id: 'spec-signal-separation',
    type: 'axiom',
    name: 'Signal nodes separate reception from interpretation',
    notes: 'A signal records an external event faithfully before any LLM reasons about implications. The raw event is never lost to a failed transduction. The signal persists and transduction can be retried.',
    description: 'Signal notes carry: source, timing, affected domain, uncertainty. transduceExternal then interprets into operational graph elements. Verified: 1 signal node in the database.'
  },
  {
    id: 'spec-axiom-board-required',
    type: 'axiom',
    name: 'Axiom nodes require a board_id',
    notes: 'Axiom nodes must have a board_id. Axioms define what a board takes as given. Board boundaries are derived from axioms, not proclaimed.',
    description: 'Verified: 67 axiom nodes exist in the database (66 on foundations board, 1 on default-board). The board_id field on gdd.nodes is nullable at the DB level but semantically required for axiom nodes.'
  },

  // --- Supersession mechanics ---
  {
    id: 'spec-superseded-never-green',
    type: 'axiom',
    name: 'A superseded node is never green regardless of satisfies edges',
    notes: 'A node with an incoming supersedes edge is never green. Downstream dependents turn red naturally through blocked-by traversal, with no cascade logic required.',
    description: 'Verified: queryIncomplete filters out superseded nodes. buildProjection tracks is_superseded separately from is_green.'
  },
  {
    id: 'spec-supersession-simple-rule',
    type: 'decision',
    name: 'Current intent = no incoming supersedes edge (simple rule)',
    notes: 'No chain-walking, no transitive supersession analysis. If the simple rule occasionally misclassifies at the edge of a complex supersession neighborhood, that error is more acceptable than the cost of a tighter rule.',
    description: 'Deliberate tradeoff: simplicity over correctness at the margin. Both queryIncomplete and buildProjection use this simple check.'
  },

  // --- Build conventions ---
  {
    id: 'spec-gated-layers',
    type: 'decision',
    name: 'Build by dependency-stable layers with verification gates',
    notes: 'Do not proceed to the next layer until every test in the current layer passes. The 8 layers: schema, core writes, core reads, HTTP admin, provider resolution, clientSession, MCP wrapper, agents.',
    description: 'Gate discipline prevents cascading incorrectness. Layer 2 (writes) must be verified before Layer 3 (reads) because reads tested against broken writes produce false confidence. An LLM that attempts a single-pass build will produce plausible but broken code.'
  },
  {
    id: 'spec-canonical-test-fixture',
    type: 'decision',
    name: 'One small stable fixture graph reused across all test layers',
    notes: 'The canonical fixture: one red intent, one green intent (with expression and satisfies edge), one blocked-by edge, one gap, one decision with closes edge to gap, one signal.',
    description: 'Without a shared fixture, each test file re-solves the fixture problem, leading to inconsistency and wasted effort.'
  },
  {
    id: 'spec-test-isolation-prefix',
    type: 'decision',
    name: 'All test data uses a consistent ID prefix for cleanup',
    notes: 'Test IDs use a consistent prefix. Cleanup respects FK ordering: edges first, then graph_memberships, then nodes, then graphs.',
    description: 'FK constraint ordering matters: deleting nodes before their edges causes constraint violations. Operations with dynamic IDs (transduceExternal) must accept an optional ID parameter in tests.'
  },
  {
    id: 'spec-llm-injection-not-config',
    type: 'decision',
    name: 'LLM-dependent operations accept an injected llm function',
    notes: 'translateRepresentation, transduceExternal, and clientSession each accept an llm parameter -- a function that takes a prompt and returns a string. The system does not prescribe which LLM.',
    description: 'Makes operations testable (inject mock), provider-agnostic, and composable. REST endpoints need middleware to provide the llm function; without it, they return 501.'
  },

  // --- Transduction reliability ---
  {
    id: 'spec-transduction-projection-bounded',
    type: 'axiom',
    name: 'Transduction operates against a projection, not the full graph',
    notes: 'When LLM-dependent operations call the LLM, they pass a projection -- the relevant subgraph -- not the entire graph. This bounds the context window and keeps the referential surface small.',
    description: 'LLM transduction degrades as the graph grows. Projection-bounding is the first safeguard.'
  },
  {
    id: 'spec-transduction-validator',
    type: 'axiom',
    name: 'Transduction output is validated deterministically before committing',
    notes: 'A deterministic validator checks LLM output before it touches the graph: references must exist, types must match vocabulary, test conditions must be present on intent types. Failures become gap nodes preserving the original input.',
    description: 'The pattern: LLM proposes, validator disposes. The LLM is good at interpretation but unreliable at referential integrity. Transduction failures are never silent -- ambiguity surfaces as gaps.'
  },

  // --- Expression failure ---
  {
    id: 'spec-five-repair-paths',
    type: 'decision',
    name: 'Five repair paths when an expression fails its test',
    notes: 'When the test does not pass: (1) code is wrong -- fix it, (2) test is wrong -- supersede the intent, (3) test is unverifiable -- create a gap with tensions-with edge, (4) dependency broken -- repair upstream first, (5) stuck -- create a gap with everything known.',
    description: 'In all cases: never record an expression that does not satisfy its test. A green intent with a failing test is worse than a red intent -- it hides a lie in the graph.'
  },
  {
    id: 'spec-never-record-failing-expression',
    type: 'axiom',
    name: 'Never record an expression whose test condition does not pass',
    notes: 'A green intent with a failing test hides a lie in the graph. The graph has no runtime test execution; verification is an actor responsibility at recording time.',
    description: 'The discipline is at recording time. Do not add automated test re-execution against recorded expressions. Trust is in the act of recording, not in continuous verification.'
  },

  // --- queryIncomplete specifics ---
  {
    id: 'spec-queryincomplete-exclusions',
    type: 'decision',
    name: 'queryIncomplete excludes compose, expression, decision, signal, and axiom',
    notes: 'Only intent-typed nodes (the 16 schema/operation/integration/constraint/structural types plus gap) appear in incomplete results.',
    description: 'Compose has structural tests. Expression, decision, signal, and axiom have no test conditions. Verified in queryIncomplete.js.'
  },
  {
    id: 'spec-workable-is-query-result',
    type: 'axiom',
    name: 'Workability is computed at query time, never stored',
    notes: 'Whether a red intent is workable (all blocked-by targets green) is determined by traversing edges at query time. Never stored as a column.',
    description: 'queryIncomplete with workable=true computes this by checking dependencies. downstream_count is also computed at query time for prioritization.'
  },

  // --- Build order ---
  {
    id: 'spec-layers-thematic-not-strict',
    type: 'axiom',
    name: 'Layers are thematic groupings, not strict build sequence',
    notes: 'Dependency order is defined by blocked-by edges, not layer numbers. Follow the edges, not the numbering.',
    description: 'The 8 gated build steps are a sound dependency sequence, but within each step blocked-by edges are authoritative.'
  },
  {
    id: 'spec-bootstrap-privilege',
    type: 'axiom',
    name: 'First build steps are privileged -- they happen outside the graph mechanism',
    notes: 'Schema creation, root intent insertion, and Layer -1 happen outside the normal graph mechanism because the mechanism does not yet exist.',
    description: 'Bootstrap: (1) CREATE SCHEMA + tables + enums, (2) INSERT gdd-root, (3) INSERT Layer -1, (4) INSERT Layer 0-7. After bootstrap, all work uses the graph mechanism.'
  },
  {
    id: 'spec-commit-only-source-changes',
    type: 'decision',
    name: 'Git commit only when source files changed',
    notes: 'Commit and push only when source files in the build workspace changed. Graph-only mutations and configuration changes do not produce commits.',
    description: 'Graph state lives in PostgreSQL, source state in git. Recording an expression (graph mutation) does not warrant a commit; writing the code it references does.'
  },

  // --- Node type categories ---
  {
    id: 'spec-schema-types',
    type: 'axiom',
    name: 'Three schema types: define-table, define-type, define-schema',
    notes: 'Schema types represent data structures that need to exist. Typically tier A tests (DDL verification queries).',
    description: 'Verified counts: define-table (16), define-type (9), define-schema (1). Most mechanical intent types.'
  },
  {
    id: 'spec-operation-types',
    type: 'axiom',
    name: 'Five operation types for functions and behaviors',
    notes: 'implement-operation (function), implement-endpoint (API route), implement-traversal (graph query), implement-projection (view construction), implement-mutation (graph write).',
    description: 'Verified: implement-operation (71) dominates. endpoint (1), traversal (6), projection (1), mutation (0). Most operations are functions.'
  },
  {
    id: 'spec-integration-types',
    type: 'axiom',
    name: 'Three integration types: integrate, derive, translate',
    notes: 'integrate (components connected), derive (value from other state), translate (convert representations).',
    description: 'Verified: integrate (0), derive (0), translate (3 -- renderHuman, renderLLM, translateRepresentation).'
  },
  {
    id: 'spec-constraint-types',
    type: 'axiom',
    name: 'Two constraint types: constrain-permission, constrain-invariant',
    notes: 'Permission (access control) and invariant (always-true condition). Both unused in current build.',
    description: 'These exist for future agent scope/trust enforcement intents.'
  },
  {
    id: 'spec-structural-types',
    type: 'axiom',
    name: 'Three structural types: establish-convention, define-vocabulary, compose',
    notes: 'Convention (pattern), vocabulary (fixed terms), compose (grouping, structural test). Compose heavily used (15); others await use.',
    description: 'Compose nodes group layers (gdd-root, foundation-tables, projection-mechanism, etc).'
  },
  {
    id: 'spec-do-not-over-decompose',
    type: 'axiom',
    name: 'Intents should be meaningful and testable, not over-decomposed',
    notes: 'An intent should be large enough to be meaningful and small enough to have a clear test condition. "Build the whole system" is too large; "add a column" is too small unless genuinely separate.',
    description: 'Right granularity = natural unit of testability. Cannot write a clear test? Maybe it is a gap or too large. Test trivially obvious? Maybe too small.'
  },
  {
    id: 'spec-gap-for-genuine-decisions',
    type: 'decision',
    name: 'Use gap for genuine decisions -- do not guess',
    notes: 'If you do not know which approach to take, create a gap with the question and options. Do not guess.',
    description: 'A gap with options is visible and honest. A wrong guess passing its test hides risk behind a green light.'
  },

  // ========================================================================
  // agents.md: Agent definitions, scope, trust, triggers
  // ========================================================================

  {
    id: 'spec-agent-definition-separates-concerns',
    type: 'axiom',
    name: 'Agent definition separates four concerns',
    notes: 'An agent definition separates identity (id, name), scope (what it works on), trust (what it can write), and trigger (when it activates). These are stored together but conceptually independent axes.',
    description: 'Prevents the common bundling where "agent" conflates who, what, permissions, and scheduling. Each axis can be changed independently.'
  },
  {
    id: 'spec-agent-not-new-kind',
    type: 'axiom',
    name: 'An agent is not a new kind of thing',
    notes: 'An agent is a precise, persistent definition of an autonomous actor that runs the same loop every actor runs. No new node types, no special execution model.',
    description: 'The agent table is operational state (config), not a new graph primitive. The loop: queryIncomplete within scope, buildProjection, execute, recordExpression, repeat.'
  },
  {
    id: 'spec-agent-actor-agnostic',
    type: 'axiom',
    name: 'Agent definitions are actor-agnostic',
    notes: 'Nothing requires the actor to be an LLM. Valid actors: LLM, developer, junior developer, team, scout, mixed human-LLM pair.',
    description: 'A team is an agent with broader scope. A specialist has narrow scope and full trust. The graph does not care what fills the definition.'
  },
  {
    id: 'spec-mixed-actor-pairs',
    type: 'decision',
    name: 'Mixed human-LLM pairs share scope with different trust',
    notes: 'Human directs intent (full trust), LLM produces expressions (express-only). Coordination through the graph, not standups.',
    description: 'Both see the same scope. The graph mediates -- no direct communication channel needed.'
  },
  {
    id: 'spec-scope-three-forms',
    type: 'decision',
    name: 'Agent scope has three forms: intents, tag, projection',
    notes: 'Scope is jsonb: {"type":"intents","ids":[...]} or {"type":"tag","tag":"..."} or {"type":"projection","root":"...","depth":N}.',
    description: 'queryIncomplete is filtered to scope. The agent cannot see or mutate intents outside its jurisdiction. Intents form is most precise, tag most flexible, projection gives structural neighborhoods.'
  },
  {
    id: 'spec-board-awareness-gap',
    type: 'decision',
    name: 'Board-awareness in agent scope is a known gap',
    notes: 'Agent scope does not currently support board-scoping. As boards become primary organizational units, agents will need board-scoping. Known gap, not deliberate omission.',
    description: 'Currently scope is intent IDs, tags, or projection roots -- not board membership. Acknowledged for future resolution.'
  },
  {
    id: 'spec-trust-full',
    type: 'decision',
    name: 'Full trust: create intents, expressions, gaps, and edges',
    notes: 'Maximum autonomy. Can restructure its scope area -- add new intents, decompose existing ones, link with edges.',
    description: 'Same write permissions as a human within its scope.'
  },
  {
    id: 'spec-trust-express-only',
    type: 'decision',
    name: 'Express-only: record expressions and create gaps, not intents or edges',
    notes: 'Can satisfy existing intents and surface problems as gaps, but cannot create new intents or structural edges.',
    description: 'More powerful than it appears: satisfying an intent is an interpretive choice. When multiple approaches satisfy the test and the choice matters, create a gap.'
  },
  {
    id: 'spec-trust-gaps-only',
    type: 'decision',
    name: 'Gaps-only: a scout that can only create gap nodes',
    notes: 'Explores scope, identifies what it cannot resolve, surfaces gaps with notes. Cannot create intents, expressions, or edges.',
    description: 'Example: daily-scheduled LLM scanner reading the whole graph looking for ambiguity or missing test conditions.'
  },
  {
    id: 'spec-trigger-four-types',
    type: 'decision',
    name: 'Four trigger types: manual, event, schedule, continuous',
    notes: 'Manual: explicit activateAgent (default). Event: new-red-in-scope, node_created, query_included. Schedule: cron. Continuous: polls at interval, pauses when scope all green.',
    description: 'Trigger is declarative graph state. The scheduler that reads triggers and activates agents is infrastructure outside the graph.'
  },
  {
    id: 'spec-agent-status-lifecycle',
    type: 'decision',
    name: 'Agent status: defined, active, paused',
    notes: 'Defined: exists but not running. Active: currently executing. Paused: stopped (gap, scope exhausted, or manual).',
    description: 'Status is mutable operational state, not graph state. An agent pauses when it hits a gap it cannot resolve.'
  },
  {
    id: 'spec-scheduling-through-projection',
    type: 'axiom',
    name: 'Scheduling emerges from projecting intents over agent scopes',
    notes: 'Critical path from structure. Resource contention as scope overlap. Buffer health as gap accumulation rate. What-if analysis as re-scoping.',
    description: 'No scheduling algorithm, no duration estimates, no Gantt charts. The graph projected over agent scopes IS the schedule, updated every time an intent turns green or a gap appears.'
  },
  {
    id: 'spec-granularity-over-time',
    type: 'axiom',
    name: 'Long-term projects use granularity over time',
    notes: 'Near-term: intents with tests. Mid-term: intents plus gaps. Far-term: compose intents plus many gaps. All exist in the present. Gaps resolve into intents as knowledge accumulates.',
    description: 'No Gantt charts, no calendar dates. blocked-by edges create natural temporal ordering. The roadmap is a projection that maintains itself.'
  },
  {
    id: 'spec-overlapping-scopes-tensions',
    type: 'decision',
    name: 'Overlapping agent scopes create tensions-with edges',
    notes: 'Scout+builder overlap is normal. Two full-trust agents on the same intents need human attention. The edge makes it visible.',
    description: 'Not necessarily wrong, but worth surfacing rather than letting it cause silent conflicts.'
  },

  // ========================================================================
  // session-continuity.md: Session bookmarks and working intents
  // ========================================================================

  {
    id: 'spec-session-supersede-chains',
    type: 'decision',
    name: 'Session context is a supersede chain of intents per actor',
    notes: 'Each actor gets a chain starting with session-context-{actor-id}. Each session creates a timestamped successor, records an expression summary, then supersedes the previous tip.',
    description: 'The non-superseded node is the current bookmark. Found via /api/current querying for pattern with no incoming supersedes edge. Uses only existing primitives.'
  },
  {
    id: 'spec-session-per-actor',
    type: 'decision',
    name: 'Session context is per-actor, not shared',
    notes: 'Each actor maintains its own chain. An arriving actor reads only its own tip. Prevents interleaving.',
    description: 'session-context-claude-code and session-context-ken are independent chains.'
  },
  {
    id: 'spec-session-startup-routine',
    type: 'decision',
    name: 'Session startup: GET /api/current then project from tip',
    notes: 'Arriving actor calls /api/current?pattern=session-context-{actor-id}, then projects from the returned tip to read last session summary (completed, next, open questions).',
    description: 'Context recovery for stateless LLM actors. The projection from the tip contains the bookmark intent, its expression artifacts, and neighboring gaps or decisions.'
  },
  {
    id: 'spec-session-end-routine',
    type: 'decision',
    name: 'Session end: create timestamped intent, record expression, supersede tip',
    notes: 'Expression artifacts are structured: actor, date, project, completed[], next[], open_questions[]. Test condition: projecting from this node, actor can state status and next steps without other sources.',
    description: 'The new node becomes the sole chain tip after superseding the old one.'
  },
  {
    id: 'spec-multiple-tips-reconcile',
    type: 'decision',
    name: 'Multiple chain tips mean abnormal exit; reconcile by merging',
    notes: 'If /api/current returns more than one node, sessions exited without superseding. Read each projection, merge context, create one new intent that supersedes all tips.',
    description: 'This is honest, not broken. Multiple tips are a truthful record of sessions running without clean handoff.'
  },
  {
    id: 'spec-team-session-view',
    type: 'decision',
    name: 'Team view is a graph of session-context chain tips',
    notes: 'A team graph contains the chain tips of all actors plus the team bookmark. Querying gives project status and individual positions.',
    description: 'Composes individual chains into a team picture using existing graph membership mechanism.'
  },
  {
    id: 'spec-session-no-new-machinery',
    type: 'axiom',
    name: 'Session continuity uses only existing graph primitives',
    notes: 'Intents, expressions, satisfies edges, supersedes edges, graphs. No new types, no special tables.',
    description: 'If sessions required new primitives, the graph model would be incomplete. Working with existing primitives validates the model.'
  },
  {
    id: 'spec-working-intent-ephemeral',
    type: 'decision',
    name: 'Working-intent tracking is ephemeral file state, not graph state',
    notes: 'select/get/clear_working_intent manage a JSON file on disk. Answers "what am I working on now" (intra-session). Session bookmark answers "what is my full context" (inter-session).',
    description: 'Working intent is lost when session ends -- correct. The session bookmark captures durable summary. Do not combine them.'
  },

  // ========================================================================
  // mcp-server.md: MCP setup, tools, connectors
  // ========================================================================

  {
    id: 'spec-mcp-embedded',
    type: 'decision',
    name: 'MCP server embedded in Express, not separate',
    notes: 'The MCP server runs inside the existing Express app. One port, one process, one deployment unit.',
    description: 'Mounted via mountMcp(app) in src/mcp.js. No inter-service communication. The alternative (standalone MCP server) was rejected as unnecessary operational complexity.'
  },
  {
    id: 'spec-mcp-single-endpoint',
    type: 'decision',
    name: '/mcp is the sole MCP endpoint using Streamable HTTP',
    notes: 'A single Express route at /mcp serves the entire MCP protocol. SDK manages protocol negotiation. No /mcp/tools, /mcp/query, etc.',
    description: 'Mounted via app.all("/mcp", ...). Not SSE or WebSocket -- Streamable HTTP transport.'
  },
  {
    id: 'spec-mcp-36-tools',
    type: 'axiom',
    name: '36 MCP tools registered',
    notes: 'ask, query_incomplete, build_projection, create_intent, record_expression, link_expression, create_graph, add_node_to_graph, remove_node_from_graph, query_graph_nodes, node_graphs, create_gap, create_decision, supersede_intent, query_agents, configure_provider, set_test_condition, query_unlinked, create_edge, supersede_edge, create_board, query_boards, get_board, record_tension_reading, assign_node_to_board, query_board_axioms, create_edge_node, query_edge_nodes, get_edge_node, record_sensitivity_reading, convert_gap_to_edge, expand_edge_node, select_working_intent, clear_working_intent, get_working_intent, query_skills.',
    description: 'Most map 1:1 to operations. Exceptions: "ask" composes via clientSession; "configure_provider" does CRUD on llm_providers; working-intent tools do file I/O. Verified against src/mcp.js.'
  },
  {
    id: 'spec-mcp-tools-delegate-to-operations',
    type: 'axiom',
    name: 'MCP tools delegate to named operations, not raw SQL',
    notes: 'Operations contain validation and business logic that raw SQL would bypass. Three exceptions do inline SQL or file I/O: configure_provider, query_board_axioms, working-intent tools.',
    description: 'The indirection matters: createIntent validates types, recordExpression creates satisfies edges, buildProjection filters superseded edges.'
  },
  {
    id: 'spec-mcp-csv-parsing',
    type: 'decision',
    name: 'Comma-separated strings for multi-value MCP inputs',
    notes: 'blocked_by, intent_ids, closes, related_nodes passed as comma-separated strings, parsed server-side. Protocol constraint workaround.',
    description: 'MCP tool inputs are flat string schemas. Pipe-separated for failed_articulation_attempts specifically.'
  },
  {
    id: 'spec-mcp-connectors',
    type: 'axiom',
    name: 'Any MCP-capable tool connects to http://localhost:3000/mcp',
    notes: 'Claude Code (.claude/settings.json), Claude Desktop (config json), Excel/Word/PowerPoint (Claude add-in connector settings), any generic MCP client.',
    description: 'Protocol is standard Streamable HTTP. Project-level settings preferred for Claude Code.'
  },
  {
    id: 'spec-mcp-localhost-default',
    type: 'decision',
    name: 'MCP server is localhost-only by default',
    notes: 'Remote access requires authentication. The MCP endpoint includes write access -- unauthenticated remote access allows arbitrary graph mutations.',
    description: 'Do not expose /mcp to the public internet without authentication. MCP protocol supports auth headers.'
  },
  {
    id: 'spec-mcp-working-intent-file',
    type: 'decision',
    name: 'Working intent stored as filesystem JSON at ~/.claude/hooks/',
    notes: 'select_working_intent validates intent existence then writes JSON. clear deletes file. get reads file. Chosen so Claude Code hooks can read it.',
    description: 'Session-local state, not graph state. If file absent, get returns "No working intent selected."'
  },

  // ========================================================================
  // ui-client.md: User-facing surfaces
  // ========================================================================

  {
    id: 'spec-ui-external-mcp-client',
    type: 'decision',
    name: 'User surfaces are external MCP clients, not served by backend',
    notes: 'Admin surfaces (dashboard, intent detail, gap surface) served by Express. User surfaces (natural language intake, composition) are external MCP clients.',
    description: 'A user surface CAN be served from the same Express process (public/chat/) -- the constraint is architectural (must be MCP client), not deployment. No separate UI client app exists yet.'
  },
  {
    id: 'spec-ui-mcp-only-data-path',
    type: 'axiom',
    name: 'UI data flows exclusively through MCP tool calls',
    notes: 'The user-facing UI does not access the database directly and does not call REST endpoints. All data through MCP.',
    description: 'Architectural constraint, not suggestion. Any UI implementation is decoupled from backend internals -- sees only the MCP tool interface.'
  },
  {
    id: 'spec-ui-stack-freedom',
    type: 'decision',
    name: 'UI stack choice left to building LLM',
    notes: 'Only requirement: can act as MCP client. Web app, desktop app, CLI dashboard, terminal UI all valid.',
    description: 'Layer 5 intents define what must be shown, not how.'
  },
  {
    id: 'spec-ui-separate-directory',
    type: 'decision',
    name: 'UI builds in its own directory (e.g. GDD-UI/)',
    notes: 'Separate from skill files (gdd-install/) and backend (GDD/). Reinforces the architectural constraint -- cannot accidentally import backend modules.',
    description: 'Three directories: gdd-install/ (read-only skills), GDD/ (backend + admin), GDD-UI/ (user surfaces).'
  },
  {
    id: 'spec-ui-admin-vs-user-boundary',
    type: 'axiom',
    name: 'Admin surfaces call REST API; user surfaces call MCP tools',
    notes: 'Admin serves direct graph actors who speak graph vocabulary. User serves natural language actors. Both access the same graph through different protocols.',
    description: 'Admin dashboard exists in public/; user-facing UI does not exist yet.'
  },

  // ========================================================================
  // system-origins.md: Layer -1 founding decisions
  // ========================================================================

  {
    id: 'spec-layer-minus-one',
    type: 'axiom',
    name: 'Layer -1 inscribes pre-graph decisions as graph citizens',
    notes: 'Founding decisions made before the graph existed are inscribed retroactively in the graph vocabulary, making them queryable, legible, and supersedeable.',
    description: 'Without Layer -1, substrate choice, runtime, and protocol live only in prose -- outside the graph reasoning machinery. Layer -1 completes the self-hosting proof operationally.'
  },
  {
    id: 'spec-layer-minus-one-arrives-green',
    type: 'axiom',
    name: 'Layer -1 nodes arrive already satisfied',
    notes: 'Intent and expression inserted together with satisfies edge. No actor works these intents. Historical record, not work queue.',
    description: 'Same posture as gdd-root. system-origins compose is green from insertion because all children arrive green.'
  },
  {
    id: 'spec-founding-decision-supersession',
    type: 'axiom',
    name: 'Founding decisions are supersedeable through normal operations',
    notes: 'To change a founding decision: create new expression, add satisfies edge to abstract intent, add supersedes edge to old expression. Abstract intent stays green throughout.',
    description: 'Example: PostgreSQL -> Neo4j migration. Create new expression, supersede old one. The intent "persist graph state reliably" is substrate-independent. Downstream intents unaffected.'
  },
  {
    id: 'spec-system-origins-compose',
    type: 'decision',
    name: 'system-origins is a compose node child of gdd-root',
    notes: 'Groups six founding decisions: persist-graph-state, serve-http, mcp-reachability, schema-namespacing, config-injection, founding-moment.',
    description: 'Green from insertion since all children arrive green. Added to gdd-root children alongside existing layer children.'
  },
  {
    id: 'spec-persist-graph-state',
    type: 'decision',
    name: 'Founding decision: PostgreSQL for persistent graph state',
    notes: 'PostgreSQL 14+ with gdd schema. Chosen for JSONB, reliability, broad availability, zero extra infrastructure for single-node deployment.',
    description: 'Abstract intent: "system persists graph state reliably." Supersedeable -- a future substrate swap creates a new expression. Alternatives: SQLite (no JSONB), MongoDB (less relational), in-memory (fails restart test).'
  },
  {
    id: 'spec-serve-http',
    type: 'decision',
    name: 'Founding decision: Express.js for HTTP surface',
    notes: 'Express on Node.js. Same process serves REST API and MCP. Default port 3000.',
    description: 'Abstract intent: "graph operations accessible over HTTP." Alternatives: Fastify (viable), raw http (too low-level).'
  },
  {
    id: 'spec-mcp-reachability',
    type: 'decision',
    name: 'Founding decision: @modelcontextprotocol/sdk for MCP',
    notes: 'Official SDK with Streamable HTTP transport on /mcp. Any MCP-capable tool connects without bespoke integration.',
    description: 'Streamable HTTP over SSE for proxy/HTTP2 compatibility. The protocol is the interface.'
  },
  {
    id: 'spec-schema-namespacing',
    type: 'decision',
    name: 'Founding decision: gdd schema namespace',
    notes: 'All GDD tables in dedicated "gdd" schema. Schema-qualified references. No collision with host database tables.',
    description: 'DROP SCHEMA gdd CASCADE removes everything cleanly. Alternatives: separate database (harder joins), prefix convention (error-prone).'
  },
  {
    id: 'spec-config-injection',
    type: 'decision',
    name: 'Founding decision: environment variables for configuration',
    notes: '12-factor convention. .env file (gitignored) for local defaults. No hardcoded values in source.',
    description: 'Variables: GDD_DB_HOST/PORT/NAME/USER/PASSWORD, GDD_PORT, GDD_GITHUB_TOKEN/REPO. Alternatives: config files (format varies), secrets manager (overhead).'
  },
  {
    id: 'spec-layer-minus-one-deferred',
    type: 'decision',
    name: 'Layer -1 nodes are deferred, not abandoned',
    notes: 'The built system does NOT insert Layer -1 nodes. They exist only in system-origins.md. Inscribing them is deferred.',
    description: 'A known gap between spec and implementation. The founding decisions are real; they are just not yet first-class graph citizens. Acknowledged rather than hidden.'
  },

  // ========================================================================
  // graph-completeness.md: Design decisions
  // ========================================================================

  {
    id: 'spec-decision-log-is-reasoning-record',
    type: 'axiom',
    name: 'The decision log is a reasoning record, not the authoritative spec',
    notes: 'graph-completeness.md records why decisions were made. Operation names it references may be outdated. The authoritative spec is intent-graph.md.',
    description: 'Do not treat the decision log as a build guide. Treat it as a record of the intellectual path.'
  },
  {
    id: 'spec-expressions-as-nodes',
    type: 'decision',
    name: 'Expressions are first-class nodes, not a subordinate table',
    notes: 'Expression nodes live in gdd.nodes (type "expression") with artifacts JSONB. Connect to intents via satisfies edges. The old gdd.expressions table with intent_id FK was removed.',
    description: 'Many-to-many satisfaction: shared implementations, cross-cutting concerns, collaborative expression. Do not maintain a separate expressions table.'
  },
  {
    id: 'spec-graph-memberships-join-table',
    type: 'decision',
    name: 'Graph memberships are a join table, not a column on nodes',
    notes: 'gdd.graph_memberships (graph_id, node_id) with unique constraint. Enables fragments as overlapping subgraphs with shared boundary nodes.',
    description: 'Replaces graph_id column on nodes. A node can appear in multiple graphs. Removing from one graph does not affect membership in others.'
  },
  {
    id: 'spec-satisfies-seventh-edge-type',
    type: 'decision',
    name: 'satisfies is the seventh edge type completing the expression-as-node model',
    notes: 'satisfies (expression -> intent) replaces the old derivation from gdd.expressions rows. An intent with incoming satisfies edge is green.',
    description: 'Makes many-to-many satisfaction natural and visible in topology.'
  },
  {
    id: 'spec-axiom-seventh-node-kind',
    type: 'decision',
    name: 'Axiom is the seventh node kind',
    notes: 'Board-level governing constraints. Require notes and board_id. No test_condition. Excluded from queryIncomplete. Supersedeable. Board boundaries derived from axioms.',
    description: 'edge_statement field removed in favor of axiom-based boundary definition. Seven node kinds total.'
  },
  {
    id: 'spec-removed-sessions',
    type: 'decision',
    name: 'Sessions, mutations table, and related operations removed',
    notes: 'No sessions table, no mutations table, no session status enum, no actor type enum. Work is creating graph elements. No session container.',
    description: 'The graph under write-only semantics IS the complete record. Sessions were transactional boundaries the system does not need.'
  },

  // ========================================================================
  // graph-merge.md: Cross-graph collaboration
  // ========================================================================

  {
    id: 'spec-cross-graph-edges',
    type: 'axiom',
    name: 'Edges can cross graph boundaries; contains cannot',
    notes: 'blocked-by, tensions-with, refines, and satisfies can span graphs. contains is internal to a graph -- composition does not cross boundaries.',
    description: 'Cross-graph blocked-by = dependency across teams. Cross-graph satisfies = shared implementation. Do not create cross-graph contains edges.'
  },
  {
    id: 'spec-cross-graph-explicit',
    type: 'axiom',
    name: 'Cross-graph edges are bilateral agreements, not inferred',
    notes: 'Both parties must acknowledge the dependency. Either can remove their end (surfaces as broken dependency in the other graph -- visible, not silent).',
    description: 'Do not build automatic cross-graph dependency detection. Cross-graph edges represent deliberate commitments.'
  },
  {
    id: 'spec-merge-projection-read-only',
    type: 'decision',
    name: 'mergeProjection is a read-only view of the collaboration surface',
    notes: 'Given graph IDs, produces: shared nodes, cross-graph edges, test conflicts, unresolved gaps, coverage gaps. Does not modify either graph.',
    description: 'Not yet implemented. Post-bootstrap capability. Surfaces the intersection without changing anything.'
  },
  {
    id: 'spec-merge-is-negotiation',
    type: 'axiom',
    name: 'Merge is negotiation, not automatic merging',
    notes: 'Convene, project, negotiate, record. Test conflicts are negotiation points. Gaps are the honest output of unresolvable conflicts. Changes recorded as graph elements.',
    description: 'Each graph remains sovereign. The graph provides structure for negotiation, not a substitute for it.'
  },
  {
    id: 'spec-merge-post-bootstrap',
    type: 'decision',
    name: 'Graph merge is a post-bootstrap capability',
    notes: 'mergeProjection and negotiation sessions are not in the layer definitions. Create intents through the graph itself when ready.',
    description: 'Single-graph operations are the foundation merge builds on. Deferred because not needed for single-graph operation.'
  },
  {
    id: 'spec-boards-and-graphs-coexist',
    type: 'axiom',
    name: 'Boards and graphs are independent organizational dimensions',
    notes: 'board_id (governed by axioms) and graph memberships (participation scope) are orthogonal. Boards govern how work proceeds; graphs govern what is visible.',
    description: 'mergeProjection crossing board boundaries should surface axiom conflicts alongside test conflicts. Do not conflate boards with graphs.'
  },

  // ========================================================================
  // community.md: Optional feedback loop
  // ========================================================================

  {
    id: 'spec-community-opt-in',
    type: 'axiom',
    name: 'Community feedback loop is entirely opt-in',
    notes: 'User must explicitly opt in. If they say no, nothing changes. System works identically without it.',
    description: 'Do not enable by default. Do not make it a prerequisite. The opt-in conversation explains: what posts (reports + gaps), where (GitHub Discussions), what for (multi-model skill file improvement), what needed (GDD_GITHUB_TOKEN).'
  },
  {
    id: 'spec-community-what-posts',
    type: 'axiom',
    name: 'Community posts reports and gaps; never code or credentials',
    notes: 'Build reports: intents expressed, gaps created, model used. Gap nodes: what was known, what was not articulable. Never: source code, expressions, DB credentials, environment details.',
    description: 'Clear boundary: structural graph info is shared, implementation details stay local.'
  },
  {
    id: 'spec-multi-model-triangulation',
    type: 'axiom',
    name: 'Multi-model triangulation improves skill files through comparison',
    notes: 'When multiple models build from the same instructions, their reports reveal: where each got stuck (gaps), interpretive differences (expressions differ), ambiguous instructions (gaps at same point), clear instructions (expressed without difficulty).',
    description: 'The loop between implementation and instruction improvement closes automatically.'
  },
  {
    id: 'spec-community-github-discussions',
    type: 'decision',
    name: 'Community uses GitHub Discussions at kentyler/GraphDrivenDevelopment',
    notes: 'Categories: Build Reports, Gaps, Skill File Feedback, General. GitHub GraphQL API for posting. Repository and category IDs fetched once and cached.',
    description: 'Token: GDD_GITHUB_TOKEN with write:discussion scope. Same injection pattern as other env vars. Alternatives: Issues (implies tracked work), separate forum (fragments community).'
  },
  {
    id: 'spec-community-post-work-hook',
    type: 'decision',
    name: 'Community posting is a post-work hook on agent completion',
    notes: 'After activateAgent completes, if enabled, post summary of created nodes/edges plus gaps. Gated by opt-in and GDD_GITHUB_TOKEN.',
    description: 'No changes to agent table. Side effect of completion. Graph remains source of truth; Discussions is a read-only mirror.'
  },
];

async function populate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Ensure foundations board exists
    await client.query(`
      INSERT INTO gdd.boards (id, created_by, statement)
      VALUES ('foundations', 'system', 'The rules that govern how intent graphs are built and operated -- the intellectual commitments and building stances that precede design.')
      ON CONFLICT (id) DO NOTHING
    `);

    let inserted = 0;
    let skipped = 0;
    for (const claim of claims) {
      const result = await client.query(`
        INSERT INTO gdd.nodes (id, type, name, notes, description, board_id)
        VALUES ($1, $2, $3, $4, $5, 'foundations')
        ON CONFLICT (id) DO NOTHING
      `, [claim.id, claim.type, claim.name, claim.notes, claim.description]);
      if (result.rowCount > 0) inserted++;
      else skipped++;
    }
    console.log(`Inserted ${inserted} claims, skipped ${skipped} (already existed).`);

    await client.query('COMMIT');

    // Summary
    const foundClaims = await client.query(`SELECT COUNT(*) FROM gdd.nodes WHERE board_id = 'foundations'`);
    const byType = await client.query(`SELECT type, COUNT(*) FROM gdd.nodes WHERE board_id = 'foundations' GROUP BY type ORDER BY type`);
    const byPrefix = await client.query(`
      SELECT
        CASE WHEN id LIKE 'found-%' THEN 'found-' WHEN id LIKE 'spec-%' THEN 'spec-' ELSE 'other' END as prefix,
        COUNT(*)
      FROM gdd.nodes WHERE board_id = 'foundations' GROUP BY 1 ORDER BY 1
    `);
    console.log(`\nFoundations board total: ${foundClaims.rows[0].count} claims`);
    byType.rows.forEach(r => console.log(`  ${r.type}: ${r.count}`));
    console.log('By prefix:');
    byPrefix.rows.forEach(r => console.log(`  ${r.prefix}: ${r.count}`));

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
