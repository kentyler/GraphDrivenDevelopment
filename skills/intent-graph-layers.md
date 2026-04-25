# Intent Graph Layers

The layer definitions for the GDD intent graph. These JSON blocks are the graph's starting state -- insert them during bootstrap (see `intent-graph.md`, Build Order, step 3).

Read `intent-graph.md` first for the model, vocabulary, and conventions.

### Layer 0: Foundation -- Schema and Core Types

Note: The two core graph tables (nodes, edges) and the graph_memberships join table carry no temporal metadata -- no `created_at`, no `created_by`. The graph's history is its topology (supersession chains, closed gaps, satisfies edges from expression nodes), not timestamps. The graphs table carries `created_at` as administrative metadata (when the graph identity was established). The three operational tables (agents, skills, llm_providers) also carry `created_at` -- these are configuration and registry tables, not graph elements, and their creation time is useful administrative metadata that does not contradict the graph's write-only semantics.

```json
[
  {
    "id": "foundation-tables",
    "type": "compose",
    "name": "Graph foundation tables",
    "description": "The database tables that store the global intent graph.",
    "children": ["table-nodes", "table-edges", "table-graphs", "table-graph-memberships", "table-agents", "table-skills", "table-llm-providers", "type-node-type", "type-edge-type", "type-agent-trust", "type-agent-status"]
  },
  {
    "id": "table-nodes",
    "type": "define-table",
    "name": "Intent nodes table",
    "description": "Stores all nodes in the global graph -- intents, compose nodes, gap nodes, decision nodes, signal nodes, and expression nodes. Each row has type, test condition, throughput, notes, and artifacts. No status column -- red/green is derived by checking for incoming satisfies edges (from expression nodes to intents). test_condition is nullable: required for intent types (the verifiable claim), null for gap, decision, signal, and expression nodes, and structural for compose nodes ('all contains children have satisfies edges'). artifacts (JSONB, nullable) is used only by expression nodes.",
    "table_name": "gdd.nodes",
    "test": {
      "condition": "Table exists with columns: id, type (typed as gdd.node_type enum), name, description, test_condition (nullable), test_verification, throughput (numeric, nullable), notes (text, nullable), artifacts (JSONB, nullable). No status column. Red/green is derived by checking for incoming satisfies edges from expression nodes. Gap, decision, signal, and expression nodes have null test_condition. All other non-compose types require a non-null test_condition. Only expression nodes use the artifacts column.",
      "verification": "SELECT * FROM information_schema.columns WHERE table_schema='gdd' AND table_name='nodes'"
    }
  },
  {
    "id": "table-edges",
    "type": "define-table",
    "name": "Intent edges table",
    "description": "Stores directed edges between nodes. Each edge has a type (blocked-by, contains, tensions-with, refines, supersedes, closes, satisfies).",
    "table_name": "gdd.edges",
    "test": {
      "condition": "Table exists with columns: id, from_node, to_node, edge_type (typed as gdd.edge_type enum)",
      "verification": "SELECT * FROM information_schema.columns WHERE table_schema='gdd' AND table_name='edges'"
    }
  },
  {
    "id": "table-graphs",
    "type": "define-table",
    "name": "Graphs table",
    "description": "Stores graph identities. Each intent graph has a name and owner. Nodes belong to graphs through gdd.graph_memberships (a join table), not through a graph_id column on nodes. This allows nodes to appear in multiple graphs -- enabling fragments as overlapping subgraphs via shared boundary nodes.",
    "table_name": "gdd.graphs",
    "test": {
      "condition": "Table exists with columns: id (text PK), name (text), owner (text), created_at (timestamp)",
      "verification": "SELECT * FROM information_schema.columns WHERE table_schema='gdd' AND table_name='graphs'"
    }
  },
  {
    "id": "table-graph-memberships",
    "type": "define-table",
    "name": "Graph memberships table",
    "description": "Join table linking nodes to graphs. A node can appear in multiple graphs (shared boundary nodes). This replaces a graph_id column on nodes, enabling fragments as overlapping subgraphs. The combination (graph_id, node_id) is unique.",
    "table_name": "gdd.graph_memberships",
    "test": {
      "condition": "Table exists with columns: graph_id (text FK to gdd.graphs), node_id (text FK to gdd.nodes), unique constraint on (graph_id, node_id)",
      "verification": "SELECT * FROM information_schema.columns WHERE table_schema='gdd' AND table_name='graph_memberships'"
    }
  },
  {
    "id": "table-agents",
    "type": "define-table",
    "name": "Agents table",
    "description": "Stores agent definitions -- named, scoped, trust-bounded autonomous actors. Each agent has a scope (which intents it operates on), a trust level (what it can write back), and a status. See skills/agents.md for full specification.",
    "table_name": "gdd.agents",
    "test": {
      "condition": "Table exists with columns: id, name, scope (JSONB), trust_level, trigger (JSONB, default '{\"type\":\"manual\"}'), status, created_at",
      "verification": "SELECT * FROM information_schema.columns WHERE table_schema='gdd' AND table_name='agents'"
    }
  },
  {
    "id": "table-skills",
    "type": "define-table",
    "name": "Skill directory table",
    "description": "Indexes all skill files and external capabilities available to the system. Each row registers a skill with its purpose, file path (for local skill files), endpoint (for APIs and MCP connectors), and category of work it covers. The LLM consults this table before loading skill files -- it is the first step in full kitting. When the LLM writes a new skill file, it registers it here. The directory also lists external execution surfaces (Office tools, APIs, MCP connectors) so the LLM knows what capabilities exist before reasoning about a request.",
    "table_name": "gdd.skills",
    "test": {
      "condition": "Table exists with columns: id, name, description, file_path (nullable -- null for external capabilities), endpoint (nullable -- null for local files), category, created_at",
      "verification": "SELECT * FROM information_schema.columns WHERE table_schema='gdd' AND table_name='skills'"
    }
  },
  {
    "id": "table-llm-providers",
    "type": "define-table",
    "name": "LLM providers table",
    "description": "Stores LLM provider configurations. The system requires at least one active provider for natural language intake, intent construction from user asks, and agent activation. Multiple providers can be configured; one is marked active. The server resolves the active provider dynamically per request -- no restart needed. Without an active provider, natural language surfaces return 501 but direct graph access works fully.",
    "table_name": "gdd.llm_providers",
    "test": {
      "condition": "Table exists with columns: id, name, provider (e.g. anthropic, openai, google), api_key, model, is_active (boolean), created_at. At least one provider must be active for natural language surfaces to function. A REST endpoint at /api/settings/llm supports CRUD operations. A configure_provider MCP tool exposes the same capability to external clients.",
      "verification": "SELECT * FROM information_schema.columns WHERE table_schema='gdd' AND table_name='llm_providers'; curl /api/settings/llm returns provider list."
    }
  },
  {
    "id": "type-node-type",
    "type": "define-type",
    "name": "Node type enum",
    "description": "The six node types: intent, compose, gap, decision, signal, expression.",
    "type_name": "gdd.node_type",
    "values": ["intent", "compose", "gap", "decision", "signal", "expression"],
    "test": {
      "condition": "Enum type exists in database with all six values",
      "verification": "SELECT enumlabel FROM pg_enum WHERE enumtypid = 'gdd.node_type'::regtype"
    }
  },
  {
    "id": "type-edge-type",
    "type": "define-type",
    "name": "Edge type enum",
    "description": "The seven edge types: blocked-by, contains, tensions-with, refines, supersedes, closes, satisfies.",
    "type_name": "gdd.edge_type",
    "values": ["blocked-by", "contains", "tensions-with", "refines", "supersedes", "closes", "satisfies"],
    "test": {
      "condition": "Enum type exists in database with all seven values",
      "verification": "SELECT enumlabel FROM pg_enum WHERE enumtypid = 'gdd.edge_type'::regtype"
    }
  },
  {
    "id": "type-agent-trust",
    "type": "define-type",
    "name": "Agent trust level enum",
    "description": "What an agent can write back: full (create intents, record expressions, create gaps, create edges), express-only (record expressions and create gaps), gaps-only (only create gaps -- a scout).",
    "type_name": "gdd.agent_trust",
    "values": ["full", "express-only", "gaps-only"],
    "test": {
      "condition": "Enum type exists in database",
      "verification": "SELECT enumlabel FROM pg_enum WHERE enumtypid = 'gdd.agent_trust'::regtype"
    }
  },
  {
    "id": "type-agent-status",
    "type": "define-type",
    "name": "Agent status enum",
    "description": "Agent lifecycle: defined (exists but not running), active (currently executing), paused (stopped -- gap encountered, scope exhausted, or manual pause).",
    "type_name": "gdd.agent_status",
    "values": ["defined", "active", "paused"],
    "test": {
      "condition": "Enum type exists in database",
      "verification": "SELECT enumlabel FROM pg_enum WHERE enumtypid = 'gdd.agent_status'::regtype"
    }
  }
]
```

### Layer 1: Core Operations -- CRUD and Basic Traversal

These intents are all `blocked-by` the foundation tables.

```json
[
  {
    "id": "op-create-intent",
    "type": "implement-operation",
    "name": "Create intent node",
    "description": "Insert a new node into the global graph. Validates type against the fixed vocabulary. For intent types: test_condition is required -- reject creation if missing or empty. For gap nodes: test_condition must be null, notes field is required. For decision nodes: test_condition must be null, notes field is required. For signal nodes: test_condition must be null, notes field is required (contains the raw event detail). For expression nodes: test_condition must be null, artifacts field is required (JSONB). For compose nodes: test_condition is null in the database -- greenness is derived at query time by checking whether all contains children have incoming satisfies edges. Accepts an optional blocked_by array of intent IDs. If provided, the node is inserted first, then blocked-by edges are created. A new intent has no incoming satisfies edge, so it is red by definition.",
    "operation_name": "createIntent",
    "input": "Node fields (type, name, description, test, optional blocked_by[], optional notes, optional artifacts JSONB). test.condition is REQUIRED for intent types, null for gaps, decisions, signals, and expressions, null for compose (derived structurally). artifacts is REQUIRED for expression nodes.",
    "output": "Created node with id",
    "blocked_by": ["foundation-tables"],
    "test": {
      "condition": "Can create nodes and retrieve them by id. Rejects intent-type creation if test_condition is null/empty. Accepts gap creation with null test_condition and required notes. Accepts decision creation with null test_condition and required notes. Accepts signal creation with null test_condition and required notes. Accepts expression creation with null test_condition and required artifacts JSONB. Accepts compose creation with structural test. New intent nodes have no incoming satisfies edge (red). Expression nodes are neither red nor green.",
      "verification": "Integration test: create intent node, gap node, decision node, signal node, expression node, compose node. Verify rejection when intent type has no test_condition. Verify gap, decision, and signal require notes. Verify expression requires artifacts."
    }
  },
  {
    "id": "op-create-edge",
    "type": "implement-operation",
    "name": "Create edge",
    "description": "Insert a directed edge between two nodes. Validates both nodes exist. Validates edge_type against the seven-value enum. A satisfies edge (expression -> intent) makes the target intent green.",
    "operation_name": "createEdge",
    "input": "from_node, to_node, edge_type",
    "output": "Created edge",
    "blocked_by": ["foundation-tables"],
    "test": {
      "condition": "Can create edges of all seven types. Adding a 'blocked-by' edge affects workability -- a red intent with an unsatisfied blocked-by dependency is not workable (queryIncomplete with workable filter excludes it). Adding a 'supersedes' edge marks the target as superseded. Adding a 'closes' edge links a decision to a gap. Adding a 'satisfies' edge (from expression node to intent) makes the target intent green.",
      "verification": "Integration test: create two nodes, add blocked-by edge, verify workability. Create supersedes, closes, and satisfies edges, verify structure."
    }
  },
  {
    "id": "op-record-expression",
    "type": "implement-operation",
    "name": "Record expression",
    "description": "Record that one or more intents have been satisfied. Creates an expression node (type='expression') with artifacts JSONB, then creates satisfies edges from the expression node to each specified intent. The intents are now green -- they have incoming satisfies edges. Downstream intents that were blocked by these may now be workable. Accepts intent_ids[] (array) to support many-to-many: one expression can satisfy multiple intents.",
    "operation_name": "recordExpression",
    "input": "intent_ids[] (array of intent IDs to satisfy), artifacts (JSONB), name, description (optional summary)",
    "output": "Created expression node with satisfies edges",
    "blocked_by": ["op-create-intent", "op-create-edge"],
    "test": {
      "condition": "Recording an expression creates an expression node and satisfies edges to each intent in intent_ids[]. Each linked intent is now green (has an incoming satisfies edge). Downstream intents blocked by these become workable if all their other dependencies also have satisfies edges. Supports multiple intent_ids -- one expression satisfying multiple intents.",
      "verification": "Integration test: create chain A blocks B blocks C. Record expression on A (intent_ids: ['A']), verify B is now workable. Record expression on B, verify C is workable. Test multi-intent: record expression with intent_ids: ['X', 'Y'], verify both X and Y are green."
    }
  },
  {
    "id": "op-link-expression",
    "type": "implement-operation",
    "name": "Link expression to additional intent",
    "description": "Add a satisfies edge from an existing expression node to another intent. Supports the many-to-many model: after an expression is recorded, it can be linked to additional intents it also satisfies. Validates that the from_node is an expression node and the to_node is an intent node.",
    "operation_name": "linkExpression",
    "input": "expression_id (existing expression node), intent_id (intent to link)",
    "output": "Created satisfies edge",
    "blocked_by": ["op-record-expression"],
    "test": {
      "condition": "Linking an expression to an additional intent creates a satisfies edge. The newly linked intent becomes green. Rejects linking if from_node is not an expression node.",
      "verification": "Integration test: create expression via recordExpression for intent A. Link same expression to intent B via linkExpression. Verify both A and B are green. Attempt to link a non-expression node, verify rejection."
    }
  },
  {
    "id": "op-traverse-dependencies",
    "type": "implement-traversal",
    "name": "Traverse dependency chain",
    "description": "Given an intent node, traverse blocked-by edges in both directions: forward to find all upstream dependencies (what must be done first), reverse to find all downstream dependents (what this unlocks). Returns the subgraph, not a flat list.",
    "traversal_name": "traverseDependencies",
    "start": "Any intent node",
    "pattern": "Follow blocked-by edges forward (upstream deps) and reverse (downstream dependents)",
    "returns": "Subgraph of dependency chain with status at each node",
    "blocked_by": ["op-create-intent", "op-create-edge"],
    "test": {
      "condition": "Given a chain A -> B -> C -> D, traversing from C returns A,B upstream and D downstream with correct statuses.",
      "verification": "Integration test with a known chain"
    }
  },
  {
    "id": "op-query-incomplete",
    "type": "implement-traversal",
    "name": "Query incomplete intents",
    "description": "Return all intent nodes that are red (no incoming satisfies edge) and current (not superseded). Expression nodes, decision nodes, and signal nodes are excluded -- expression nodes are artifacts (neither red nor green), decision nodes are deliberation records, and signal nodes are raw events (already happened). Gap nodes ARE included -- they are detected blockers that need resolution. This is the primary entry point for 'what should I work on next?' Supports a 'workable' filter: when set, returns only red intents whose blocked-by dependencies are all green (have incoming satisfies edges). Compose nodes are green when all their contains children are green. Ordering: if any red intents have throughput values, order by total downstream throughput (the intent's own throughput plus the throughput of all intents it transitively unblocks). Null throughput is treated as zero. If no throughput values exist anywhere, fall back to ordering by downstream dependent count.",
    "traversal_name": "queryIncomplete",
    "start": "Global graph",
    "pattern": "Filter for current nodes (no supersedes edge pointing at them) with no incoming satisfies edge (red). Exclude expression nodes, decision nodes, and signal nodes. Include gap nodes. Optional workable filter checks blocked-by edges. Order by total downstream throughput desc (with downstream dependent count as fallback)",
    "returns": "Array of red intent nodes with their downstream dependent counts and total downstream throughput",
    "blocked_by": ["op-create-intent", "op-create-edge"],
    "test": {
      "condition": "Returns only red, current intents and gaps (no incoming satisfies edge, not superseded). Does not return green intents (have incoming satisfies edges). Does not return superseded intents. Does not return expression nodes, decision nodes, or signal nodes. With workable filter: intent A (red, all deps green) is returned, intent B (red, has a red dep) is not. Without workable filter: both A and B are returned. Compose node with all children green is itself green and not returned. When throughput values exist: intent A (throughput 100, unblocks B with throughput 200) ranks above intent C (throughput 250, unblocks nothing) because A's total is 300.",
      "verification": "Integration test: create intents with and without incoming satisfies edges, with and without satisfied dependencies, with and without supersession. Verify filtered and unfiltered queries. Test compose node green derivation. Verify expression nodes are excluded from results."
    }
  },
  {
    "id": "op-query-skills",
    "type": "implement-traversal",
    "name": "Query skill directory",
    "description": "Return skill entries from gdd.skills. Supports filtering by category. This is the full kitting entry point -- the LLM consults it before every request to know what capabilities exist and how to reach them.",
    "traversal_name": "querySkills",
    "start": "gdd.skills table",
    "pattern": "Filter by category (optional), return all matching skill entries",
    "returns": "Array of skill entries with name, description, file_path, endpoint, category",
    "blocked_by": ["table-skills"],
    "test": {
      "condition": "Returns all skills when no filter is given. Returns only matching skills when filtered by category. Returns empty array when no skills match.",
      "verification": "Insert test skills with different categories, verify filtered and unfiltered queries return correct results."
    }
  },
  {
    "id": "op-create-gap",
    "type": "implement-operation",
    "name": "Create gap node",
    "description": "Convenience operation for creating a gap node. Equivalent to createIntent with type='gap', but named explicitly because pulling the andon cord is a first-class action. Requires notes -- the gap must record everything the actor does know. Returns the created gap node.",
    "operation_name": "createGap",
    "input": "name, notes (REQUIRED), optional blocked_by[]",
    "output": "Created gap node with id",
    "blocked_by": ["op-create-intent"],
    "test": {
      "condition": "Creates a gap node with null test_condition and required notes. Rejects creation if notes are empty. The gap appears in queryIncomplete results.",
      "verification": "Create a gap with notes, verify it exists with type='gap' and null test_condition. Attempt creation without notes, verify rejection."
    }
  },
  {
    "id": "op-create-decision",
    "type": "implement-operation",
    "name": "Create decision node",
    "description": "Create a decision node -- an authored closure that records what was chosen, alternatives considered, and scope governed. Requires notes. Optionally accepts a closes[] array of gap IDs; for each, creates a 'closes' edge (decision -> gap).",
    "operation_name": "createDecision",
    "input": "name, description, notes (REQUIRED), optional closes[] (array of gap IDs)",
    "output": "Created decision node with id, plus any closes edges created",
    "blocked_by": ["op-create-intent", "op-create-edge"],
    "test": {
      "condition": "Creates a decision node with null test_condition and required notes. Rejects creation if notes are empty. If closes[] is provided, creates closes edges from the decision to each gap. Decision nodes do not appear in queryIncomplete (they have no test condition and are deliberation nodes, not operational ones).",
      "verification": "Create a decision with notes and closes[] pointing to a gap. Verify decision exists with type='decision', closes edges exist, and the decision does not appear in queryIncomplete."
    }
  },
  {
    "id": "op-supersede",
    "type": "implement-operation",
    "name": "Supersede intent",
    "description": "Create a supersedes edge from a new intent to an old intent, marking the old one as superseded. The old intent remains in the graph but is no longer current. Downstream dependents of the old intent whose dependency structure is affected turn red.",
    "operation_name": "supersedeIntent",
    "input": "new_intent_id, old_intent_id",
    "output": "Created supersedes edge",
    "blocked_by": ["op-create-intent", "op-create-edge"],
    "test": {
      "condition": "Creates a supersedes edge (new -> old). The old intent no longer appears in queryIncomplete results (it is superseded). Downstream dependents of the old intent are affected: if they were blocked-by the old intent, they need to be re-evaluated against the new intent.",
      "verification": "Integration test: create intent A, supersede with intent B, verify A no longer appears in queryIncomplete. Verify downstream dependents are correctly affected."
    }
  },
  {
    "id": "op-create-graph",
    "type": "implement-operation",
    "name": "Create graph",
    "description": "Create a graph identity in gdd.graphs. A graph is a named container for organizing nodes via graph_memberships. Nodes belong to graphs through the join table, not through a column on nodes -- this allows shared boundary nodes across graphs.",
    "operation_name": "createGraph",
    "input": "id, name, owner",
    "output": "Created graph row",
    "blocked_by": ["foundation-tables"],
    "test": {
      "condition": "Can create a graph and retrieve it by id. Graph has name and owner.",
      "verification": "Integration test: create a graph, verify it exists with correct fields."
    }
  },
  {
    "id": "op-add-node-to-graph",
    "type": "implement-operation",
    "name": "Add node to graph",
    "description": "Create a membership linking a node to a graph in gdd.graph_memberships. A node can belong to multiple graphs (shared boundary nodes). Duplicate (graph_id, node_id) pairs are rejected by the unique constraint.",
    "operation_name": "addNodeToGraph",
    "input": "graph_id, node_id",
    "output": "Created membership row",
    "blocked_by": ["op-create-graph", "op-create-intent"],
    "test": {
      "condition": "Can add a node to a graph. Adding the same node to multiple graphs works (shared nodes). Duplicate membership is rejected.",
      "verification": "Integration test: create graph and node, add membership. Add same node to second graph. Verify both memberships exist. Attempt duplicate, verify rejection."
    }
  },
  {
    "id": "op-remove-node-from-graph",
    "type": "implement-operation",
    "name": "Remove node from graph",
    "description": "Delete a membership linking a node to a graph. The node itself is not deleted -- only its membership in that graph. The node may still belong to other graphs.",
    "operation_name": "removeNodeFromGraph",
    "input": "graph_id, node_id",
    "output": "Deleted membership row",
    "blocked_by": ["op-add-node-to-graph"],
    "test": {
      "condition": "Can remove a node from a graph. The node still exists in gdd.nodes. The node may still belong to other graphs.",
      "verification": "Integration test: add node to two graphs, remove from one, verify node still in other graph and still exists in nodes table."
    }
  },
  {
    "id": "op-query-graph-nodes",
    "type": "implement-traversal",
    "name": "Query graph nodes",
    "description": "Return all nodes that belong to a given graph, via graph_memberships. Supports optional type filter.",
    "traversal_name": "queryGraphNodes",
    "start": "A graph ID",
    "pattern": "Join graph_memberships with nodes, optional type filter",
    "returns": "Array of nodes belonging to the graph",
    "blocked_by": ["op-add-node-to-graph"],
    "test": {
      "condition": "Returns all nodes in a graph. With type filter, returns only matching types. Returns empty array for empty graph.",
      "verification": "Integration test: add multiple nodes to a graph, query with and without type filter, verify correct results."
    }
  },
  {
    "id": "op-node-graphs",
    "type": "implement-traversal",
    "name": "Query node's graphs",
    "description": "Return all graphs that a given node belongs to, via graph_memberships. This is the reverse lookup -- given a node, find its graph memberships.",
    "traversal_name": "nodeGraphs",
    "start": "A node ID",
    "pattern": "Join graph_memberships with graphs for the given node",
    "returns": "Array of graphs the node belongs to",
    "blocked_by": ["op-add-node-to-graph"],
    "test": {
      "condition": "Returns all graphs a node belongs to. Returns empty array if node has no memberships.",
      "verification": "Integration test: add node to two graphs, query nodeGraphs, verify both returned."
    }
  }
]
```

### Layer 2: Projection -- The Read-as-View Mechanism

These intents are blocked by Layer 1 operations.

```json
[
  {
    "id": "projection-mechanism",
    "type": "compose",
    "name": "Projection mechanism",
    "description": "The ability to construct a situated view of the global graph from a specific vantage point. A projection is ephemeral -- built at read time, not stored. It shows the graph as seen from a particular position: what's relevant, what's red, what's green, what's adjacent.",
    "children": ["op-build-projection"]
  },
  {
    "id": "op-build-projection",
    "type": "implement-projection",
    "name": "Build projection from intent",
    "description": "Given an intent node as vantage point, construct a projection: the intent itself, its dependency chain (up and down), red/green status on each node (derived from incoming satisfies edges), test conditions, gaps in the neighborhood, decisions that close those gaps, expression nodes linked via satisfies edges, and supersession context. An intent is current if it has no incoming supersedes edge -- this is the only rule, deliberately simple. The projection is a subgraph with all context needed to understand and act on this intent. Optionally accepts a graph_id to scope the projection to nodes within a specific graph (via graph_memberships).",
    "projection_name": "buildProjection",
    "source": "Global intent graph (or scoped to a graph via graph_id)",
    "vantage": "A single intent node",
    "shape": "Subgraph centered on the vantage intent, with dependency chain, red/green status, test conditions, gaps, decisions, expression nodes, and supersession chains in the neighborhood",
    "blocked_by": ["op-traverse-dependencies"],
    "test": {
      "condition": "Given intent C in a chain A->B->C->D, projection from C includes: C's full node data, A and B as upstream deps with their statuses (derived from satisfies edges), D as downstream dependent, red/green state on each, expression nodes linked via satisfies edges, any gaps and decisions in the neighborhood, any supersession chains affecting the subgraph. When graph_id is provided, projection is scoped to nodes in that graph's memberships.",
      "verification": "Integration test: build known graph, project from a middle node, verify subgraph shape. Test with graph_id scoping."
    }
  }
]
```

### Layer 3: Dual Representation

```json
[
  {
    "id": "dual-repr",
    "type": "compose",
    "name": "Dual representation",
    "description": "The global graph has two representations: LLM-legible (dense, relational, full structure) and human-legible (summary, narrative, status). The LLM translates between them.",
    "children": ["op-render-human", "op-render-llm", "op-translate-repr"]
  },
  {
    "id": "op-render-human",
    "type": "translate",
    "name": "Render human-legible view",
    "description": "Given a projection (a subgraph), produce a human-readable summary: what the intents are about, what's green (has incoming satisfies edges), what's red (no incoming satisfies edges), what's blocked (red with unsatisfied dependencies), key decisions made. Narrative form, not graph structure.",
    "from_repr": "Projection (graph structure)",
    "to_repr": "Human-readable summary (markdown or structured text)",
    "mechanism": "Deterministic rendering. The projection already contains structured data -- group intents by red/green/blocked (derived from satisfies edges and dependency traversal), format as markdown. No LLM needed for the base rendering. An LLM layer can be added on top for narrative polish, but the base is a deterministic formatter.",
    "blocked_by": ["projection-mechanism"],
    "test": {
      "condition": "A projection with 5 intents (2 green, 2 red and workable, 1 red and blocked) produces a summary that a non-technical reader can understand: what's done, what needs work, what's blocked.",
      "verification": "Generate summary from known projection, human review for clarity"
    }
  },
  {
    "id": "op-render-llm",
    "type": "translate",
    "name": "Render LLM-legible view",
    "description": "Given a projection, produce a dense structured representation optimized for LLM consumption: full node data, edge types, red/green status, test conditions, dependency chains. This replaces the system prompt -- the LLM reads this to understand its situation.",
    "from_repr": "Projection (graph structure)",
    "to_repr": "Structured JSON with full relational detail",
    "mechanism": "Direct serialization of graph structure with computed fields (status, completeness)",
    "blocked_by": ["projection-mechanism"],
    "test": {
      "condition": "LLM-legible rendering includes all node fields, all edges, red/green status, test conditions. An LLM reading this output can determine what to work on next without any additional context.",
      "verification": "Feed rendering to an LLM, ask it to identify the highest-priority work, verify it selects correctly"
    }
  },
  {
    "id": "op-translate-repr",
    "type": "translate",
    "name": "Translate between representations",
    "description": "Bidirectional translation between representations. The two directions have fundamentally different implementations: **human-to-graph** (natural language to intent nodes/edges) is an LLM operation -- accepts an `llm` function parameter, operates against a projection (not the full graph), and produces candidate mutations that are validated for referential integrity before committing. Transduction failures become gaps preserving the original input. Do NOT attempt regex or keyword parsing. **graph-to-human** (mutations to change descriptions) is deterministic -- the input is already structured, so a switch over mutation types produces readable text. No LLM needed.",
    "operation_name": "translateRepresentation",
    "input": "Content in one representation + direction (human-to-graph or graph-to-human). human-to-graph requires an `llm` function parameter.",
    "output": "Content in the other representation",
    "blocked_by": ["op-render-human", "op-render-llm"],
    "test": {
      "condition": "A natural language requirement ('we need users to be able to log in') produces intent nodes with appropriate type, test conditions, and dependencies. A graph mutation ('added blocked-by edge from X to Y') produces a human-readable description ('X now depends on Y being completed first').",
      "verification": "Round-trip test: NL -> graph -> NL, verify semantic preservation"
    }
  }
]
```

### Layer 4: Actor Integration

```json
[
  {
    "id": "actor-integration",
    "type": "compose",
    "name": "Actor integration",
    "description": "All actor types -- application users, external forces, and autonomous agents -- interact with the graph by creating nodes, edges, and expressions. Actors who interact through natural language are transduced via clientSession or transduceExternal. Actors who work against the graph directly (power users, agents) operate without transduction. Agents are first-class graph entities with scope, trust level, and auditable work.",
    "children": ["op-transduce-external", "op-client-intake", "op-define-agent", "op-activate-agent", "op-query-agents"]
  },
  {
    "id": "op-transduce-external",
    "type": "implement-operation",
    "name": "Transduce external force",
    "description": "Given an external event (regulatory change, system failure, market signal), first create a signal node recording the raw event, then interpret it into operational graph elements via LLM call. The signal node is the write surface -- it captures what happened before any interpretation. The LLM then operates against a projection (not the full graph) and produces candidate mutations. A deterministic validator checks referential integrity before committing -- unknown IDs are rejected, ambiguous references become gaps preserving the original input in their notes. If the event's impact cannot be articulated as testable intents, create gap nodes. The signal node persists regardless of transduction outcome -- it is the record of what triggered the interpretation, and transduction can be retried against it.",
    "operation_name": "transduceExternal",
    "input": "External event description, interpreter (human or agent id). Accepts an optional id_prefix parameter for test isolation (overrides the default transduction-{timestamp} format for the signal node ID).",
    "output": "Created signal node plus operational graph elements (intents, gaps, edges) representing the event's impact. Operational elements link back to the signal via blocked-by edges.",
    "blocked_by": ["op-build-projection", "op-translate-repr"],
    "test": {
      "condition": "An external event 'new data privacy regulation' creates a signal node recording the raw event, then creates intents with test conditions on affected areas linked back to the signal. The signal node persists even if transduction produces no operational elements.",
      "verification": "Integration test: simulate external event, verify signal node created, verify operational graph elements, verify signal persists independently"
    }
  },
  {
    "id": "op-client-intake",
    "type": "implement-operation",
    "name": "Client intake",
    "description": "Natural language input is transduced into graph elements via LLM call (not regex parsing), operating against a projection of the relevant subgraph. Candidate mutations are validated for referential integrity before committing -- transduction failures become gaps preserving the original input. The LLM routes each piece of client input: if the client can articulate what 'done' looks like, create an intent with a test condition. If not, create a gap node. Any actor that can state an intent can state what done looks like. If they can't, they have a question, not an intent.",
    "operation_name": "clientSession",
    "input": "Client conversation content, client id",
    "output": "Created graph elements (intents with tests, or gaps)",
    "blocked_by": ["op-build-projection", "op-translate-repr"],
    "note": "The MCP tool ask is a transport wrapper over clientSession. ask calls clientSession and handles lifecycle automatically. It is not a separate orchestration function -- a builder implementing ask should call clientSession, not reimplement its logic.",
    "test": {
      "condition": "A client saying 'users need to log in with email' creates an intent node with a test condition. A client saying 'it needs to be faster' creates a gap node (no testable condition).",
      "verification": "Integration test: simulate client input with clear and vague requirements, verify intent vs gap routing"
    }
  },
  {
    "id": "op-define-agent",
    "type": "implement-operation",
    "name": "Define agent",
    "description": "Create an agent definition as a first-class graph entity. An agent has a scope (which intents it operates on -- a projection, subgraph, or tag), a trust level (what it can write back), and a trigger (when to activate -- manual, event, schedule, or continuous). Defining an agent is the mission assignment -- the human sets scope, trust, and trigger; the agent executes within that scope autonomously. Agents do not store an LLM function or provider reference -- they use the globally configured active provider, resolved at runtime from gdd.llm_providers. See skills/agents.md for full specification.",
    "operation_name": "defineAgent",
    "input": "agent_id, scope (projection spec or intent_ids), trust_level (full | express-only | gaps-only), trigger (manual | event | schedule | continuous, defaults to manual)",
    "output": "Agent node stored in the graph with scope and trust metadata",
    "blocked_by": ["projection-mechanism"],
    "test": {
      "condition": "Can create an agent definition with scope and trust level. Agent node is queryable. Multiple agents with overlapping scopes create tensions-with edges.",
      "verification": "Integration test: define agent with scope of 3 intents, verify agent node exists with correct metadata"
    }
  },
  {
    "id": "op-activate-agent",
    "type": "implement-operation",
    "name": "Activate agent",
    "description": "Start an agent running against its scoped jurisdiction. Provides renderLLM output scoped to the agent's intents, and lets it execute the standard loop: queryIncomplete (within scope) -> project -> execute -> record expression -> loop. The agent stops when it exhausts red intents in scope or creates a gap node. All work is auditable through the nodes, edges, and expressions the agent created.",
    "operation_name": "activateAgent",
    "input": "agent_id",
    "output": "Completed work summary, or gap if agent got stuck",
    "blocked_by": ["op-define-agent"],
    "test": {
      "condition": "Activating an agent with 2 red intents in scope produces expressions for both intents. Agent stops when scope is all green or a gap is created. Agent cannot mutate intents outside its scope. Agent cannot exceed its trust level (e.g., gaps-only agent cannot record expressions).",
      "verification": "Integration test: define agent with scoped intents, activate, verify it works within scope and trust boundaries"
    }
  },
  {
    "id": "op-query-agents",
    "type": "implement-operation",
    "name": "Query agents",
    "description": "List agent definitions with their current state: status, scope, and gap counts within their scope. Filterable by status and by scope overlap with a specific intent. See skills/agents.md for full specification.",
    "operation_name": "queryAgents",
    "input": "Optional filters: status, scope overlap with intent_id",
    "output": "Array of agent definitions with current state",
    "blocked_by": ["op-define-agent"],
    "test": {
      "condition": "Can list all agents. Can filter by status (e.g., only active agents). Can filter by scope overlap (e.g., agents whose scope includes intent X). Returns gap counts within each agent's scope.",
      "verification": "Integration test: define multiple agents with different statuses and scopes, verify filters work correctly"
    }
  }
]
```

### Layer 5: Human Surfaces

The system serves multiple actor types, but humans need surfaces -- places where the graph becomes legible and actionable without requiring direct graph operations. These intents describe what humans need to see and do, not how it looks. The building LLM chooses the implementation: web UI, CLI, terminal dashboard, or any other form that satisfies the behavioral test conditions.

**Two surface families with different delivery mechanisms.** Admin surfaces (dashboard, intent detail, gap surface) are served by the backend directly -- they are part of the same Express application, served as static files from `public/`, and call the REST API. They are for direct graph actors: power users, operators, and administrators who work against the graph intentionally. User-facing surfaces (client intake) are external MCP clients -- they connect through the MCP server (Layer 6), enabling actors who work inside external tools (Claude Desktop, Excel, Word, Slack) to reach the graph without leaving their environment. The backend does not serve user-facing surfaces.

```json
[
  {
    "id": "human-surfaces",
    "type": "compose",
    "name": "Human-facing surfaces",
    "description": "The surfaces through which human actors perceive and act on the graph. Split into two families: admin surfaces (backend-served, for direct graph actors) and user-facing surfaces (external MCP clients, for natural language actors). The system is fully functional without these -- direct graph calls work independently -- but human actors need these to work effectively.",
    "children": ["ui-admin-surfaces", "ui-user-surfaces"]
  },
  {
    "id": "ui-admin-surfaces",
    "type": "compose",
    "name": "Admin surfaces",
    "description": "Backend-served surfaces for direct graph actors: power users, operators, administrators. Served as static files from public/ by the Express server. Call the REST API directly. Not exposed through MCP.",
    "children": ["ui-dashboard", "ui-intent-detail", "ui-gap-surface"]
  },
  {
    "id": "ui-user-surfaces",
    "type": "compose",
    "name": "User-facing surfaces",
    "description": "External MCP clients for actors who do not speak graph directly. Connect through the MCP server (Layer 6). Any MCP-capable tool -- Claude Desktop, Excel, Word, Slack, custom apps -- can serve as a user-facing surface.",
    "children": ["ui-client-intake"]
  },
  {
    "id": "ui-dashboard",
    "type": "implement-operation",
    "name": "Dashboard surface",
    "description": "The primary entry point for human actors. Answers the question 'what's red?' by showing all active (red, current) intents, ordered by downstream impact (or throughput if values exist). Also surfaces gap count, recent graph activity (newly created nodes), and agent status summaries. This is the human-legible equivalent of queryIncomplete + queryAgents.",
    "operation_name": "dashboard",
    "input": "Optional filters: scope (subgraph), actor (whose work), time range",
    "output": "Rendered view of graph health: red intents ordered by impact, gap count, recent nodes, agent summaries",
    "blocked_by": ["op-query-incomplete", "op-render-human", "op-query-agents"],
    "test": {
      "condition": "A human looking at the dashboard can answer: what needs work next, how many gaps need decisions, which agents are active, and what was created recently. Red intents appear ordered by downstream dependent count (or throughput). Satisfied intents do not appear unless explicitly requested. Superseded intents do not appear.",
      "verification": "Create a graph with mix of red/green intents (some blocked, some workable), gaps, decisions, and superseded intents. Verify the dashboard surfaces the right information in the right order."
    }
  },
  {
    "id": "ui-intent-detail",
    "type": "implement-operation",
    "name": "Intent detail surface",
    "description": "When a human selects an intent to work on, this surface shows its full projection: the intent itself, its test condition, what blocks it, what it unblocks, any gaps and decisions in the neighborhood, supersession chains, and any expressions already recorded. This is the human-legible equivalent of buildProjection + renderHuman.",
    "operation_name": "intentDetail",
    "input": "intent_id",
    "output": "Rendered projection: intent with dependencies (upstream and downstream), test condition, expression history, gaps, decisions, supersession chains",
    "blocked_by": ["op-build-projection", "op-render-human"],
    "test": {
      "condition": "A human viewing an intent's detail can answer: what is this intent, what does 'done' look like (test condition), what must be done first (upstream deps with status), what does this unlock (downstream deps), what decisions have been made (decisions with closes edges), and what was produced (expressions).",
      "verification": "Build a projection for an intent in the middle of a dependency chain. Verify all context is present and legible."
    }
  },
  {
    "id": "ui-gap-surface",
    "type": "implement-operation",
    "name": "Gap surface",
    "description": "Gaps are the system's detected blockers -- places where an actor could not articulate a test condition or was uncertain about an expression choice. This surface collects all gaps with their notes, what they block (downstream deps), and any closes edges from decisions that resolve them. Gaps created by agents are especially important -- they are the agent's andon cord pulls, surfacing decisions that need human judgment.",
    "operation_name": "gapSurface",
    "input": "Optional filters: time range, related intent",
    "output": "Rendered list of gaps with notes, dependency context, and any closing decisions",
    "blocked_by": ["op-render-human"],
    "test": {
      "condition": "A human viewing the gap surface can see every unresolved gap (no closes edge from a decision), understand what is known (from notes), and what work is blocked until the gap is resolved (downstream deps). Resolved gaps (with closes edges) are shown separately or filtered.",
      "verification": "Create gaps, some resolved by decisions (with closes edges), some unresolved. Verify all gaps appear with full context and resolution status."
    }
  },
  {
    "id": "ui-client-intake",
    "type": "implement-operation",
    "name": "Client intake surface",
    "description": "The natural language entry surface. Actors who do not speak graph interact through this surface. Their input enters through clientSession (which handles transduction via LLM) -- ask in the MCP layer is a transport wrapper over clientSession that handles the surrounding lifecycle automatically; it is not a separate orchestration function. This surface shows what was created: intents with test conditions, or gaps where the input could not be articulated as testable claims. The transduction should be visible: what the user said, what the system understood, what was created in the graph.",
    "operation_name": "clientIntake",
    "input": "Client conversation content",
    "output": "Rendered view of the transduction: original input, created intents (with test conditions) and gaps (with notes), confirmation interface",
    "blocked_by": ["op-client-intake", "op-render-human", "mcp-tools"],
    "test": {
      "condition": "A user can state a requirement in natural language through an external MCP client and see what the system created from it: intents (with test conditions) or gaps (with notes showing what was unclear). Graph operations are immediate -- the intent is created when the LLM constructs it. If the user wants to change what was created, they say so and the LLM supersedes the intent.",
      "verification": "Simulate client input with clear requirements and vague requirements. Verify the surface shows created intents vs gaps with full context."
    }
  }
]
```

### Layer 6: MCP Server -- Execution Surfaces

The MCP server makes the graph reachable from external tools. It runs inside the existing Express app and exposes graph operations as MCP tools. See `skills/mcp-server.md` for full build instructions.

```json
[
  {
    "id": "mcp-server",
    "type": "compose",
    "name": "MCP server for execution surfaces",
    "description": "Exposes graph operations over the Model Context Protocol so external tools (Excel, Word, PowerPoint, Claude Desktop, any MCP-capable application) can connect to the graph. Most MCP tools map directly to existing graph operations. Some (like ask and configure_provider) compose multiple operations or expose infrastructure configuration. See skills/mcp-server.md for implementation details.",
    "children": ["mcp-endpoint", "mcp-tools", "mcp-connectors"]
  },
  {
    "id": "mcp-endpoint",
    "type": "implement-endpoint",
    "name": "MCP protocol endpoint",
    "description": "A single Express endpoint that serves the MCP protocol using @modelcontextprotocol/sdk. Handles protocol negotiation and Streamable HTTP transport. The builder consults the installed SDK version for the exact wiring pattern.",
    "method": "ALL",
    "path": "/mcp",
    "blocked_by": ["foundation-tables"],
    "test": {
      "condition": "The /mcp endpoint responds to MCP protocol handshake and returns the server's tool list when queried.",
      "verification": "Send an MCP initialize request to /mcp and verify it returns server capabilities and registered tools."
    }
  },
  {
    "id": "mcp-tools",
    "type": "implement-operation",
    "name": "MCP tool definitions",
    "description": "Register graph operations as MCP tools: ask (natural language entry -- creates graph elements directly), query_incomplete, query_skills, build_projection, create_intent, record_expression, link_expression, create_gap, create_decision, supersede_intent, query_agents, configure_provider, create_graph, add_node_to_graph, remove_node_from_graph, query_graph_nodes, node_graphs. Each tool maps to an existing graph operation or infrastructure endpoint -- no new logic, just protocol translation. See skills/mcp-server.md for tool specifications.",
    "operation_name": "registerMcpTools",
    "blocked_by": ["mcp-endpoint", "op-query-incomplete", "op-query-skills", "op-build-projection", "op-create-intent", "op-record-expression", "op-link-expression", "op-create-gap", "op-client-intake", "op-query-agents", "op-create-decision", "op-supersede", "op-create-graph", "op-add-node-to-graph", "op-remove-node-from-graph", "op-query-graph-nodes", "op-node-graphs", "table-llm-providers"],
    "test": {
      "condition": "All MCP tools are registered and callable. The ask tool creates an intent and returns a result. The query_incomplete tool returns red intents. The record_expression tool creates expression nodes with satisfies edges. The link_expression tool adds satisfies edges to existing expressions. The configure_provider tool can list and set active providers. The create_decision tool creates decisions. The supersede_intent tool creates supersession edges. The graph tools (create_graph, add_node_to_graph, remove_node_from_graph, query_graph_nodes, node_graphs) manage graph memberships. Each tool produces the same result as calling the equivalent REST endpoint.",
      "verification": "Call each MCP tool through an MCP client and verify results match the equivalent REST API calls."
    }
  },
  {
    "id": "mcp-connectors",
    "type": "implement-operation",
    "name": "Connector skill file generation",
    "description": "When a user connects an external tool to the GDD MCP server, the LLM writes a connector skill file capturing setup steps and tool-specific details, and registers it in gdd.skills. The skill file covers what was configured, what capabilities are available through that connector, and any limitations discovered during setup.",
    "operation_name": "registerConnector",
    "blocked_by": ["mcp-endpoint", "table-skills"],
    "test": {
      "condition": "After connecting an external tool, a skill file exists describing the connector setup and a row exists in gdd.skills with the connector's category and endpoint.",
      "verification": "Connect a test MCP client, verify a skill file was created and gdd.skills has a matching entry."
    }
  }
]
```

### Resolved Decisions

These were originally gaps, now resolved:

**Graph element construction: Explicit.** LLMs emit graph operations (createIntent, createEdge, createGap, createDecision) as primary output. There is no observer/derivation layer. Derivation contradicts the completeness model -- it introduces a lag between conversation and graph state.

**Intent supersession: Write-only.** When an intent is no longer intended, it is superseded by a new intent via a `supersedes` edge. The old intent remains in the graph as history. No removal, no deletion. Downstream dependents turn red if their dependency structure is affected -- the red/green mechanism surfaces the impact naturally. History lives in the graph topology, not in a separate log.

## Edge Summary for Initial Graph

These edges connect the intents above:

```
foundation-tables, projection-mechanism, dual-repr, actor-integration, human-surfaces, mcp-server  ->  (contained by)  ->  gdd-root
table-nodes, table-edges, table-graphs, table-graph-memberships, table-agents, table-skills, table-llm-providers, type-node-type, type-edge-type, type-agent-trust, type-agent-status  ->  (contained by)  ->  foundation-tables
op-create-intent, op-create-edge                                ->  (blocked-by)    ->  foundation-tables
op-record-expression                                            ->  (blocked-by)    ->  op-create-intent, op-create-edge
op-link-expression                                              ->  (blocked-by)    ->  op-record-expression
op-traverse-dependencies                                        ->  (blocked-by)    ->  op-create-intent, op-create-edge
op-query-incomplete                                             ->  (blocked-by)    ->  op-create-intent, op-create-edge
op-query-skills                                                 ->  (blocked-by)    ->  table-skills
op-create-gap                                                   ->  (blocked-by)    ->  op-create-intent
op-create-decision                                              ->  (blocked-by)    ->  op-create-intent, op-create-edge
op-supersede                                                    ->  (blocked-by)    ->  op-create-intent, op-create-edge
op-create-graph                                                 ->  (blocked-by)    ->  foundation-tables
op-add-node-to-graph                                            ->  (blocked-by)    ->  op-create-graph, op-create-intent
op-remove-node-from-graph                                       ->  (blocked-by)    ->  op-add-node-to-graph
op-query-graph-nodes                                            ->  (blocked-by)    ->  op-add-node-to-graph
op-node-graphs                                                  ->  (blocked-by)    ->  op-add-node-to-graph
op-build-projection                                             ->  (contained by)  ->  projection-mechanism
op-render-human, op-render-llm, op-translate-repr               ->  (contained by)  ->  dual-repr
op-transduce-external, op-client-intake, op-define-agent, op-activate-agent, op-query-agents  ->  (contained by)  ->  actor-integration
op-build-projection                                             ->  (blocked-by)    ->  op-traverse-dependencies
op-render-human, op-render-llm                                  ->  (blocked-by)    ->  projection-mechanism
op-translate-repr                                               ->  (blocked-by)    ->  op-render-human, op-render-llm
op-transduce-external                                           ->  (blocked-by)    ->  op-build-projection, op-translate-repr
op-client-intake                                                ->  (blocked-by)    ->  op-build-projection, op-translate-repr
op-define-agent                                                 ->  (blocked-by)    ->  projection-mechanism
op-activate-agent                                               ->  (blocked-by)    ->  op-define-agent
op-query-agents                                                 ->  (blocked-by)    ->  op-define-agent
ui-admin-surfaces, ui-user-surfaces                             ->  (contained by)  ->  human-surfaces
ui-dashboard, ui-intent-detail, ui-gap-surface                  ->  (contained by)  ->  ui-admin-surfaces
ui-client-intake                                                ->  (contained by)  ->  ui-user-surfaces
ui-dashboard                                                    ->  (blocked-by)    ->  op-query-incomplete, op-render-human, op-query-agents
ui-intent-detail                                                ->  (blocked-by)    ->  op-build-projection, op-render-human
ui-gap-surface                                                  ->  (blocked-by)    ->  op-render-human
ui-client-intake                                                ->  (blocked-by)    ->  op-client-intake, op-render-human, mcp-tools
mcp-endpoint, mcp-tools, mcp-connectors                         ->  (contained by)  ->  mcp-server
mcp-endpoint                                                    ->  (blocked-by)    ->  foundation-tables
mcp-tools                                                       ->  (blocked-by)    ->  mcp-endpoint, op-query-incomplete, op-query-skills, op-build-projection, op-create-intent, op-record-expression, op-link-expression, op-create-gap, op-client-intake, op-query-agents, op-create-decision, op-supersede, op-create-graph, op-add-node-to-graph, op-remove-node-from-graph, op-query-graph-nodes, op-node-graphs, table-llm-providers
mcp-connectors                                                  ->  (blocked-by)    ->  mcp-endpoint, table-skills
```
