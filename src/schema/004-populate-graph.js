const { pool } = require('../db');

// All nodes from Layers 0-7 of intent-graph-layers.md
const nodes = [
  // Layer 0: Foundation
  { id: 'foundation-tables', type: 'compose', name: 'Graph foundation tables', description: 'The database tables that store the global intent graph.', build_instructions: null },
  { id: 'table-nodes', type: 'define-table', name: 'Intent nodes table', description: 'Stores all nodes in the global graph.', test_condition: 'Table exists with columns: id, type, name, description, test_condition, test_verification, notes, artifacts.', test_verification: "SELECT * FROM information_schema.columns WHERE table_schema='gdd' AND table_name='nodes'", build_instructions: "CREATE TABLE gdd.nodes with columns: id (TEXT PK), type (gdd.node_type NOT NULL), name (TEXT NOT NULL), description (TEXT), test_condition (TEXT), test_verification (TEXT), notes (TEXT), artifacts (JSONB), build_instructions (TEXT), board_id (TEXT FK to gdd.boards). No created_at or created_by -- graph history is topology, not timestamps." },
  { id: 'table-edges', type: 'define-table', name: 'Intent edges table', description: 'Stores directed edges between nodes.', test_condition: 'Table exists with columns: id, from_node, to_node, edge_type', test_verification: "SELECT * FROM information_schema.columns WHERE table_schema='gdd' AND table_name='edges'", build_instructions: "CREATE TABLE gdd.edges with columns: id (TEXT PK, default gen_random_uuid()::text), from_node (TEXT NOT NULL FK to gdd.nodes), to_node (TEXT NOT NULL FK to gdd.nodes), edge_type (gdd.edge_type NOT NULL), description (TEXT), created_by (TEXT), superseded_by (TEXT FK to gdd.edges). No created_at." },
  { id: 'table-graphs', type: 'define-table', name: 'Graphs table', description: 'Stores graph identities.', test_condition: 'Table exists with columns: id, name, owner, created_at', test_verification: "SELECT * FROM information_schema.columns WHERE table_schema='gdd' AND table_name='graphs'", build_instructions: "CREATE TABLE gdd.graphs with columns: id (TEXT PK), name (TEXT NOT NULL), owner (TEXT), created_at (TIMESTAMP DEFAULT NOW()). Graphs table is the only core graph table with created_at -- administrative metadata." },
  { id: 'table-graph-memberships', type: 'define-table', name: 'Graph memberships table', description: 'Join table linking nodes to graphs.', test_condition: 'Table exists with columns: graph_id, node_id, unique constraint on (graph_id, node_id)', test_verification: "SELECT * FROM information_schema.columns WHERE table_schema='gdd' AND table_name='graph_memberships'", build_instructions: "CREATE TABLE gdd.graph_memberships with columns: graph_id (TEXT NOT NULL FK to gdd.graphs), node_id (TEXT NOT NULL FK to gdd.nodes), UNIQUE(graph_id, node_id). No PK column -- the unique constraint serves as the key." },
  { id: 'table-agents', type: 'define-table', name: 'Agents table', description: 'Stores agent definitions.', test_condition: 'Table exists with columns: id, name, scope, trust_level, trigger, status, created_at', test_verification: "SELECT * FROM information_schema.columns WHERE table_schema='gdd' AND table_name='agents'", build_instructions: "CREATE TABLE gdd.agents with columns: id (TEXT PK), name (TEXT NOT NULL), scope (JSONB), trust_level (gdd.agent_trust NOT NULL DEFAULT 'gaps-only'), trigger (JSONB DEFAULT '{\"type\":\"manual\"}'), status (gdd.agent_status NOT NULL DEFAULT 'defined'), created_at (TIMESTAMP DEFAULT NOW())." },
  { id: 'table-skills', type: 'define-table', name: 'Skill directory table', description: 'Indexes all skill files and external capabilities.', test_condition: 'Table exists with columns: id, name, description, file_path, endpoint, category, created_at', test_verification: "SELECT * FROM information_schema.columns WHERE table_schema='gdd' AND table_name='skills'", build_instructions: "CREATE TABLE gdd.skills with columns: id (TEXT PK, default gen_random_uuid()::text), name (TEXT NOT NULL), description (TEXT), file_path (TEXT), endpoint (TEXT), category (TEXT), created_at (TIMESTAMP DEFAULT NOW()). file_path is null for external capabilities; endpoint is null for local files." },
  { id: 'table-llm-providers', type: 'define-table', name: 'LLM providers table', description: 'Stores LLM provider configurations.', test_condition: 'Table exists with columns: id, name, provider, api_key, model, is_active, created_at', test_verification: "SELECT * FROM information_schema.columns WHERE table_schema='gdd' AND table_name='llm_providers'", build_instructions: "CREATE TABLE gdd.llm_providers with columns: id (TEXT PK, default gen_random_uuid()::text), name (TEXT NOT NULL), provider (TEXT NOT NULL), api_key (TEXT NOT NULL), model (TEXT), is_active (BOOLEAN DEFAULT FALSE), created_at (TIMESTAMP DEFAULT NOW()). Only one provider should be active at a time." },
  { id: 'type-node-type', type: 'define-type', name: 'Node type enum', description: 'All 20 node types from the fixed vocabulary.', test_condition: 'Enum type exists in database with all 20 values', test_verification: "SELECT enumlabel FROM pg_enum WHERE enumtypid = 'gdd.node_type'::regtype", build_instructions: "CREATE TYPE gdd.node_type AS ENUM ('define-table', 'define-type', 'define-schema', 'implement-operation', 'implement-endpoint', 'implement-traversal', 'implement-projection', 'implement-mutation', 'integrate', 'derive', 'translate', 'constrain-permission', 'constrain-invariant', 'establish-convention', 'define-vocabulary', 'compose', 'gap', 'decision', 'signal', 'expression', 'axiom'). 21 values total." },
  { id: 'type-edge-type', type: 'define-type', name: 'Edge type enum', description: 'The seven edge types.', test_condition: 'Enum type exists in database with all seven values', test_verification: "SELECT enumlabel FROM pg_enum WHERE enumtypid = 'gdd.edge_type'::regtype", build_instructions: "CREATE TYPE gdd.edge_type AS ENUM ('blocked-by', 'contains', 'tensions-with', 'refines', 'supersedes', 'closes', 'satisfies')." },
  { id: 'type-agent-trust', type: 'define-type', name: 'Agent trust level enum', description: 'What an agent can write back: full, express-only, gaps-only.', test_condition: 'Enum type exists in database', test_verification: "SELECT enumlabel FROM pg_enum WHERE enumtypid = 'gdd.agent_trust'::regtype", build_instructions: "CREATE TYPE gdd.agent_trust AS ENUM ('full', 'express-only', 'gaps-only')." },
  { id: 'type-agent-status', type: 'define-type', name: 'Agent status enum', description: 'Agent lifecycle: defined, active, paused.', test_condition: 'Enum type exists in database', test_verification: "SELECT enumlabel FROM pg_enum WHERE enumtypid = 'gdd.agent_status'::regtype", build_instructions: "CREATE TYPE gdd.agent_status AS ENUM ('defined', 'active', 'paused')." },

  // Layer 1: Core Operations
  { id: 'op-create-intent', type: 'implement-operation', name: 'Create intent node', description: 'Insert a new node into the global graph with type validation.', test_condition: 'Can create nodes of all types with proper validation. Rejects intent-type creation if test_condition is null/empty.', test_verification: 'Integration test: create intent, gap, decision, signal, expression, compose nodes.', build_instructions: "Implement createIntent(params) that inserts a node into gdd.nodes. Accept: id, type, name, description, test_condition, test_verification, notes, artifacts, blocked_by[], board_id, build_instructions. Validate: id/type/name required. Gap/signal/decision require notes. Expression requires artifacts (JSONB). Axiom requires notes and board_id. Force test_condition and test_verification to null for gap/decision/signal/expression/compose/axiom. If blocked_by[] provided, create blocked-by edges in same transaction. Return the created node." },
  { id: 'op-create-edge', type: 'implement-operation', name: 'Create edge', description: 'Insert a directed edge between two nodes.', test_condition: 'Can create edges of all seven types. Validates both nodes exist.', test_verification: 'Integration test: create nodes, add edges, verify structure.', build_instructions: "Implement createEdge(params) that inserts into gdd.edges. Accept: from_node, to_node, edge_type, description (optional), created_by (optional). Validate both nodes exist in gdd.nodes. Validate edge_type is one of the seven enum values. Return the created edge with generated id." },
  { id: 'op-record-expression', type: 'implement-operation', name: 'Record expression', description: 'Create expression node with satisfies edges to specified intents.', test_condition: 'Creates expression node and satisfies edges. Linked intents become green.', test_verification: 'Integration test: create chain, record expression, verify green status.', build_instructions: "Implement recordExpression(params) that creates an expression node (type='expression') with artifacts JSONB. Accept: intent_ids[] (optional), name, description, artifacts. Generate id. If intent_ids provided, create satisfies edges from expression to each intent. If intent_ids empty/omitted, expression is unlinked. Use a transaction." },
  { id: 'op-link-expression', type: 'implement-operation', name: 'Link expression to additional intent', description: 'Add a satisfies edge from an existing expression to another intent.', test_condition: 'Linking expression to intent creates satisfies edge. Intent becomes green. Rejects non-expression nodes.', test_verification: 'Integration test: link expression to additional intent, verify green.', build_instructions: "Implement linkExpression(params) that adds a satisfies edge from an existing expression node to another intent. Accept: expression_id, intent_id. Validate expression_id is type='expression'. Create satisfies edge (expression -> intent). Return the created edge." },
  { id: 'op-traverse-dependencies', type: 'implement-traversal', name: 'Traverse dependency chain', description: 'Traverse blocked-by edges in both directions.', test_condition: 'Given chain A->B->C->D, traversing from C returns A,B upstream and D downstream.', test_verification: 'Integration test with a known chain.', build_instructions: "Implement traverseDependencies(intentId) that follows blocked-by edges in both directions. Forward traversal (from_node = current) collects upstream dependencies. Reverse traversal (to_node = current) collects downstream dependents. Only follow non-superseded edges. Return { vantage, upstream[], downstream[] } with full node data at each position." },
  { id: 'op-query-incomplete', type: 'implement-traversal', name: 'Query incomplete intents', description: 'Return all red, current intents and gaps.', test_condition: 'Returns only red, current intents and gaps. Excludes expression, decision, signal nodes. Supports workable filter. Orders by downstream count.', test_verification: 'Integration test with mixed node states.', build_instructions: "Implement queryIncomplete(params) that returns red (no incoming satisfies edge), current (not superseded) intents and gaps. Accept: workable (bool), graph_id (optional), board_id (optional). Exclude expression/decision/signal/axiom nodes. Include gap nodes. Workable filter: only return nodes whose blocked-by dependencies are all green. Graph_id filter: join with graph_memberships. Order by downstream dependent count desc. Compose nodes are green when all contains children are green." },
  { id: 'op-query-skills', type: 'implement-traversal', name: 'Query skill directory', description: 'Return skill entries from gdd.skills with optional category filter.', test_condition: 'Returns all skills unfiltered, filtered by category, empty for no matches.', test_verification: 'Insert test skills, verify queries.', build_instructions: "Implement querySkills(params) that queries gdd.skills. Accept: category (optional). If category provided, filter by it. Return array of skill rows. Empty array if no matches." },
  { id: 'op-create-gap', type: 'implement-operation', name: 'Create gap node', description: 'Convenience for creating gap nodes with required notes.', test_condition: 'Creates gap with null test_condition and required notes. Rejects if notes empty.', test_verification: 'Create gap, verify in queryIncomplete.', build_instructions: "Implement createGap(params) as a convenience wrapper around createIntent with type='gap'. Accept: name, notes (required), id (optional -- generate if not provided), blocked_by[] (optional). Reject if notes empty. Return the created gap node." },
  { id: 'op-create-decision', type: 'implement-operation', name: 'Create decision node', description: 'Create decision node with optional closes edges to gaps.', test_condition: 'Creates decision with notes. Creates closes edges if closes[] provided. Not in queryIncomplete.', test_verification: 'Create decision with closes[], verify edges and exclusion from queryIncomplete.', build_instructions: "Implement createDecision(params) that creates a decision node. Accept: name, description, notes (required), closes[] (optional array of gap IDs), id (optional). Reject if notes empty. If closes[] provided, create closes edges (decision -> gap) for each. Use a transaction. Return the created decision with edges." },
  { id: 'op-supersede', type: 'implement-operation', name: 'Supersede intent', description: 'Create supersedes edge marking old intent as superseded.', test_condition: 'Creates supersedes edge. Old intent excluded from queryIncomplete.', test_verification: 'Supersede intent, verify exclusion.', build_instructions: "Implement supersedeIntent(params) that creates a supersedes edge from new_intent_id to old_intent_id. Accept: new_intent_id, old_intent_id. Validate both nodes exist. Create supersedes edge. The old intent is now superseded (excluded from queryIncomplete). Return the created edge." },
  { id: 'op-create-graph', type: 'implement-operation', name: 'Create graph', description: 'Create a graph identity in gdd.graphs.', test_condition: 'Can create and retrieve graph by id.', test_verification: 'Integration test: create graph, verify fields.', build_instructions: "Implement createGraph(params) that inserts into gdd.graphs. Accept: id, name, owner (optional). Return the created graph row." },
  { id: 'op-add-node-to-graph', type: 'implement-operation', name: 'Add node to graph', description: 'Create membership linking node to graph.', test_condition: 'Can add node to graph. Same node in multiple graphs works. Duplicate rejected.', test_verification: 'Integration test with memberships.', build_instructions: "Implement addNodeToGraph(params) that inserts into gdd.graph_memberships. Accept: graph_id, node_id. The UNIQUE constraint handles duplicate rejection. Return the created membership row." },
  { id: 'op-remove-node-from-graph', type: 'implement-operation', name: 'Remove node from graph', description: 'Delete membership. Node itself not deleted.', test_condition: 'Remove from one graph, still in other graphs and nodes table.', test_verification: 'Integration test: add to two, remove from one.', build_instructions: "Implement removeNodeFromGraph(params) that deletes from gdd.graph_memberships. Accept: graph_id, node_id. Only deletes the membership, not the node. Return confirmation." },
  { id: 'op-query-graph-nodes', type: 'implement-traversal', name: 'Query graph nodes', description: 'Return all nodes belonging to a graph.', test_condition: 'Returns all nodes in graph. Supports type filter. Empty for empty graph.', test_verification: 'Integration test with type filters.', build_instructions: "Implement queryGraphNodes(params) that joins gdd.graph_memberships with gdd.nodes. Accept: graph_id, type (optional filter). Return array of nodes belonging to the graph." },
  { id: 'op-node-graphs', type: 'implement-traversal', name: "Query node's graphs", description: 'Return all graphs a node belongs to.', test_condition: 'Returns all graphs for a node. Empty if no memberships.', test_verification: 'Integration test: node in two graphs.', build_instructions: "Implement nodeGraphs(nodeId) that joins gdd.graph_memberships with gdd.graphs for the given node. Return array of graphs the node belongs to." },

  // Layer 2: Projection
  { id: 'projection-mechanism', type: 'compose', name: 'Projection mechanism', description: 'The ability to construct a situated view of the graph from a specific vantage point.', build_instructions: null },
  { id: 'op-build-projection', type: 'implement-projection', name: 'Build projection from intent', description: 'Construct projection: intent, dependencies, red/green status, test conditions, gaps, decisions, expressions, supersession.', test_condition: 'Projection from middle of chain includes all context. Supports graph_id scoping.', test_verification: 'Integration test: build known graph, project from middle node.', build_instructions: "Implement buildProjection(intentId, { graph_id }) that constructs a situated view. Steps: (1) call traverseDependencies to get upstream/downstream, (2) if graph_id, filter to nodes in that graph via graph_memberships, (3) fetch all non-superseded edges involving these nodes, (4) find gaps in neighborhood, (5) find decisions that close those gaps, (6) find expression nodes linked via satisfies edges, (7) compute is_green (has satisfies edge), is_superseded (has supersedes edge), has_test for each node, (8) if vantage has board_id, include board with latest tension, active edge nodes with latest sensitivity, and current axioms. Return { vantage, upstream, downstream, edges, gaps, decisions, expressions, axioms, nodes (map), board, edgeNodes }." },

  // Layer 3: Dual Representation
  { id: 'dual-repr', type: 'compose', name: 'Dual representation', description: 'LLM-legible and human-legible representations of the graph.', build_instructions: null },
  { id: 'op-render-human', type: 'translate', name: 'Render human-legible view', description: 'Produce human-readable summary from projection.', test_condition: 'Projection with 5 intents (2 green, 2 red workable, 1 blocked) produces understandable summary.', test_verification: 'Generate summary from known projection.', build_instructions: "Implement renderHuman(projection) as a deterministic markdown formatter. Group intents by status: green (done), red+workable (ready to work on), red+blocked (waiting on dependencies). Show intent name, description, test condition. Include board section if present (statement, tension). Include axioms section. Include edge nodes section with latest sensitivity readings. No LLM needed -- pure formatting." },
  { id: 'op-render-llm', type: 'translate', name: 'Render LLM-legible view', description: 'Produce dense structured JSON from projection.', test_condition: 'Includes all node fields, edges, status, test conditions. LLM can identify priority work.', test_verification: 'Feed to LLM, verify correct identification.', build_instructions: "Implement renderLLM(projection) that serializes the projection as structured JSON optimized for LLM consumption. Include all node fields, all edges, red/green status, test conditions, dependency chains, board context. Compute summary statistics (total/red/green/blocked counts). The output replaces the system prompt -- an LLM reading it should know what to work on next." },
  { id: 'op-translate-repr', type: 'translate', name: 'Translate between representations', description: 'Bidirectional: human-to-graph (LLM) and graph-to-human (deterministic).', test_condition: 'NL requirement produces intent nodes. Graph mutation produces readable description.', test_verification: 'Round-trip test.', build_instructions: "Implement translateRepresentation(params). Two directions: (1) human-to-graph: accept NL input + llm function + projection context, use LLM to produce candidate graph mutations (createIntent, createEdge, etc.), validate referential integrity before committing, transduction failures become gaps. Do NOT use regex/keyword parsing. (2) graph-to-human: accept structured mutations, deterministic switch over mutation types to produce readable descriptions. No LLM needed for this direction." },

  // Layer 4: Actor Integration
  { id: 'actor-integration', type: 'compose', name: 'Actor integration', description: 'All actor types interact through the graph.', build_instructions: null },
  { id: 'op-transduce-external', type: 'implement-operation', name: 'Transduce external force', description: 'Create signal node for external event, then interpret into graph elements via LLM.', test_condition: 'External event creates signal node plus operational elements linked back to signal.', test_verification: 'Integration test: simulate event, verify signal and graph elements.', build_instructions: "Implement transduceExternal(event_description, { interpreter, context_intent_id }). Steps: (1) create a signal node recording the raw event, (2) build projection from context_intent_id (or root), (3) call LLM with projection + event to produce candidate graph mutations, (4) validate referential integrity, (5) commit valid mutations with blocked-by edges linking back to the signal. If impact cannot be articulated as testable intents, create gap nodes. Signal persists regardless of transduction outcome." },
  { id: 'op-client-intake', type: 'implement-operation', name: 'Client intake', description: 'Natural language transduced into graph elements via LLM.', test_condition: 'Clear requirement creates intent with test. Vague input creates gap.', test_verification: 'Integration test: clear and vague inputs.', build_instructions: "Implement clientSession(input, { client_id, context_intent_id }). Use LLM to transduce NL input into graph elements. If client can articulate what done looks like, create intent with test condition. If not, create gap node. Operate against a projection of the relevant subgraph. Validate candidate mutations for referential integrity. The MCP tool 'ask' is a transport wrapper over this -- do not reimplement." },
  { id: 'op-define-agent', type: 'implement-operation', name: 'Define agent', description: 'Create agent definition with scope, trust, trigger.', test_condition: 'Can create agent with scope and trust. Agent is queryable.', test_verification: 'Integration test: define agent, verify metadata.', build_instructions: "Implement defineAgent(params) that inserts into gdd.agents. Accept: id, name, scope (JSONB -- projection spec or intent_ids), trust_level (full|express-only|gaps-only), trigger (JSONB, default {type:'manual'}). Set status to 'defined'. Agents use the globally configured active LLM provider at runtime -- do not store provider reference on agent." },
  { id: 'op-activate-agent', type: 'implement-operation', name: 'Activate agent', description: 'Start agent running against scoped jurisdiction.', test_condition: 'Agent with 2 red intents produces expressions. Stops when green or gap. Respects trust.', test_verification: 'Integration test: activate, verify scope and trust boundaries.', build_instructions: "Implement activateAgent(agentId). Load agent definition, resolve active LLM provider. Provide renderLLM output scoped to agent's intents. Run loop: queryIncomplete within scope -> build projection -> execute (LLM produces graph mutations) -> record expression -> loop. Stop when: scope is all green, gap is created, or max iterations reached. Enforce trust level boundaries. Return work summary." },
  { id: 'op-query-agents', type: 'implement-operation', name: 'Query agents', description: 'List agents with state, filterable by status and scope overlap.', test_condition: 'Can list, filter by status, filter by scope overlap. Returns gap counts.', test_verification: 'Integration test: multiple agents, verify filters.', build_instructions: "Implement queryAgents(params) that queries gdd.agents. Accept: status (optional filter), intent_id (optional -- filter to agents whose scope includes this intent). For each agent, compute gap count within scope. Return array of agent definitions with current state." },

  // Layer 5: Human Surfaces
  { id: 'human-surfaces', type: 'compose', name: 'Human-facing surfaces', description: 'Surfaces for human actors to perceive and act on the graph.', build_instructions: null },
  { id: 'ui-admin-surfaces', type: 'compose', name: 'Admin surfaces', description: 'Backend-served for direct graph actors.', build_instructions: null },
  { id: 'ui-user-surfaces', type: 'compose', name: 'User-facing surfaces', description: 'External MCP clients for natural language actors.', build_instructions: null },
  { id: 'ui-dashboard', type: 'implement-operation', name: 'Dashboard surface', description: 'Primary entry: what is red, ordered by impact.', test_condition: 'Human can see: what needs work, gap count, active agents, recent activity.', test_verification: 'Create mixed graph, verify dashboard content.', build_instructions: "Build a web dashboard (HTML/CSS/JS served from public/) that shows: (1) all red intents ordered by downstream dependent count (call GET /api/incomplete), (2) gap count, (3) active agent summaries (call GET /api/agents?status=active), (4) recent graph activity. Use tabs or sections for Red/All/Gaps/Agents/Sessions/Settings views. Call REST API endpoints -- do not query the database directly." },
  { id: 'ui-intent-detail', type: 'implement-operation', name: 'Intent detail surface', description: 'Full projection for selected intent.', test_condition: 'Human can see: intent, test condition, deps, decisions, expressions.', test_verification: 'Build projection, verify all context present.', build_instructions: "Build an intent detail view that shows the full projection for a selected intent. Call GET /api/projection/{id}/human for the rendered markdown view. Show: intent name/description/test_condition, upstream dependencies with status, downstream dependents, gaps and decisions, expression history, board context if present. Navigable from the dashboard." },
  { id: 'ui-gap-surface', type: 'implement-operation', name: 'Gap surface', description: 'All gaps with notes, blocked work, and resolution status.', test_condition: 'Human can see every unresolved gap, its notes, and what it blocks.', test_verification: 'Create gaps resolved and unresolved, verify display.', build_instructions: "Build a gap surface view showing all gap nodes. For each gap: show notes, what work it blocks (downstream deps via edges), and whether it has been closed (closes edges from decisions). Separate unresolved and resolved gaps. Call GET /api/incomplete and filter for type='gap', or query nodes directly." },
  { id: 'ui-client-intake', type: 'implement-operation', name: 'Client intake surface', description: 'Natural language entry via MCP.', test_condition: 'User states requirement in NL, sees created intents/gaps. Transduction visible.', test_verification: 'Simulate client input, verify feedback.', build_instructions: "This is an external MCP client surface -- not served by the backend. Any MCP-capable tool (Claude Desktop, Excel, Word) can serve as this surface by connecting to the /mcp endpoint. The 'ask' MCP tool is the entry point. Show the user what was created from their input: intents (with test conditions) or gaps (with notes). Transduction should be visible." },

  // Layer 6: MCP Server
  { id: 'mcp-server', type: 'compose', name: 'MCP server for execution surfaces', description: 'Exposes graph operations over Model Context Protocol.', build_instructions: null },
  { id: 'mcp-endpoint', type: 'implement-endpoint', name: 'MCP protocol endpoint', description: 'Express endpoint serving MCP protocol.', test_condition: '/mcp responds to handshake and returns tool list.', test_verification: 'Send initialize request, verify capabilities.', build_instructions: "Create a single Express endpoint at /mcp using @modelcontextprotocol/sdk. Use StreamableHTTPServerTransport with sessionIdGenerator: undefined (stateless). Create McpServer instance, register tools, then in the route handler: create transport, connect server, handle request. Use app.all('/mcp', ...) to handle all HTTP methods." },
  { id: 'mcp-tools', type: 'implement-operation', name: 'MCP tool definitions', description: 'Register all graph operations as MCP tools.', test_condition: 'All tools registered and callable. Same results as REST endpoints.', test_verification: 'Call each tool, compare with REST.', build_instructions: "Register all core graph operations as MCP tools using server.tool(name, zodSchema, handler). Tools: query_incomplete, build_projection, create_intent, record_expression, link_expression, set_test_condition, query_unlinked, create_gap, create_decision, supersede_intent, supersede_edge, create_edge, query_skills, query_agents, ask, configure_provider, create_graph, add_node_to_graph, remove_node_from_graph, query_graph_nodes, node_graphs. Each tool calls the existing operation function -- no new logic, just protocol translation. Use zod for input schemas." },
  { id: 'mcp-connectors', type: 'implement-operation', name: 'Connector skill file generation', description: 'Write connector skill files when external tools connect.', test_condition: 'After connecting tool, skill file exists and gdd.skills has entry.', test_verification: 'Connect test client, verify skill file and registry.', build_instructions: "When a user connects an external tool to the MCP server, write a connector skill file capturing: what tool connected, setup steps, capabilities available, any limitations discovered. Register the skill file in gdd.skills with the connector's category and endpoint. The LLM generates the skill file content based on what it learned during setup." },

];

// All edges from the Edge Summary
const edges = [
  // gdd-root contains top-level compose nodes
  { from: 'gdd-root', to: 'foundation-tables', type: 'contains' },
  { from: 'gdd-root', to: 'projection-mechanism', type: 'contains' },
  { from: 'gdd-root', to: 'dual-repr', type: 'contains' },
  { from: 'gdd-root', to: 'actor-integration', type: 'contains' },
  { from: 'gdd-root', to: 'human-surfaces', type: 'contains' },
  { from: 'gdd-root', to: 'mcp-server', type: 'contains' },

  // foundation-tables contains
  { from: 'foundation-tables', to: 'table-nodes', type: 'contains' },
  { from: 'foundation-tables', to: 'table-edges', type: 'contains' },
  { from: 'foundation-tables', to: 'table-graphs', type: 'contains' },
  { from: 'foundation-tables', to: 'table-graph-memberships', type: 'contains' },
  { from: 'foundation-tables', to: 'table-agents', type: 'contains' },
  { from: 'foundation-tables', to: 'table-skills', type: 'contains' },
  { from: 'foundation-tables', to: 'table-llm-providers', type: 'contains' },
  { from: 'foundation-tables', to: 'type-node-type', type: 'contains' },
  { from: 'foundation-tables', to: 'type-edge-type', type: 'contains' },
  { from: 'foundation-tables', to: 'type-agent-trust', type: 'contains' },
  { from: 'foundation-tables', to: 'type-agent-status', type: 'contains' },

  // Layer 1 blocked-by
  { from: 'op-create-intent', to: 'foundation-tables', type: 'blocked-by' },
  { from: 'op-create-edge', to: 'foundation-tables', type: 'blocked-by' },
  { from: 'op-record-expression', to: 'op-create-intent', type: 'blocked-by' },
  { from: 'op-record-expression', to: 'op-create-edge', type: 'blocked-by' },
  { from: 'op-link-expression', to: 'op-record-expression', type: 'blocked-by' },
  { from: 'op-traverse-dependencies', to: 'op-create-intent', type: 'blocked-by' },
  { from: 'op-traverse-dependencies', to: 'op-create-edge', type: 'blocked-by' },
  { from: 'op-query-incomplete', to: 'op-create-intent', type: 'blocked-by' },
  { from: 'op-query-incomplete', to: 'op-create-edge', type: 'blocked-by' },
  { from: 'op-query-skills', to: 'table-skills', type: 'blocked-by' },
  { from: 'op-create-gap', to: 'op-create-intent', type: 'blocked-by' },
  { from: 'op-create-decision', to: 'op-create-intent', type: 'blocked-by' },
  { from: 'op-create-decision', to: 'op-create-edge', type: 'blocked-by' },
  { from: 'op-supersede', to: 'op-create-intent', type: 'blocked-by' },
  { from: 'op-supersede', to: 'op-create-edge', type: 'blocked-by' },
  { from: 'op-create-graph', to: 'foundation-tables', type: 'blocked-by' },
  { from: 'op-add-node-to-graph', to: 'op-create-graph', type: 'blocked-by' },
  { from: 'op-add-node-to-graph', to: 'op-create-intent', type: 'blocked-by' },
  { from: 'op-remove-node-from-graph', to: 'op-add-node-to-graph', type: 'blocked-by' },
  { from: 'op-query-graph-nodes', to: 'op-add-node-to-graph', type: 'blocked-by' },
  { from: 'op-node-graphs', to: 'op-add-node-to-graph', type: 'blocked-by' },

  // Layer 2 contains + blocked-by
  { from: 'projection-mechanism', to: 'op-build-projection', type: 'contains' },
  { from: 'op-build-projection', to: 'op-traverse-dependencies', type: 'blocked-by' },

  // Layer 3 contains + blocked-by
  { from: 'dual-repr', to: 'op-render-human', type: 'contains' },
  { from: 'dual-repr', to: 'op-render-llm', type: 'contains' },
  { from: 'dual-repr', to: 'op-translate-repr', type: 'contains' },
  { from: 'op-render-human', to: 'projection-mechanism', type: 'blocked-by' },
  { from: 'op-render-llm', to: 'projection-mechanism', type: 'blocked-by' },
  { from: 'op-translate-repr', to: 'op-render-human', type: 'blocked-by' },
  { from: 'op-translate-repr', to: 'op-render-llm', type: 'blocked-by' },

  // Layer 4 contains + blocked-by
  { from: 'actor-integration', to: 'op-transduce-external', type: 'contains' },
  { from: 'actor-integration', to: 'op-client-intake', type: 'contains' },
  { from: 'actor-integration', to: 'op-define-agent', type: 'contains' },
  { from: 'actor-integration', to: 'op-activate-agent', type: 'contains' },
  { from: 'actor-integration', to: 'op-query-agents', type: 'contains' },
  { from: 'op-transduce-external', to: 'op-build-projection', type: 'blocked-by' },
  { from: 'op-transduce-external', to: 'op-translate-repr', type: 'blocked-by' },
  { from: 'op-client-intake', to: 'op-build-projection', type: 'blocked-by' },
  { from: 'op-client-intake', to: 'op-translate-repr', type: 'blocked-by' },
  { from: 'op-define-agent', to: 'projection-mechanism', type: 'blocked-by' },
  { from: 'op-activate-agent', to: 'op-define-agent', type: 'blocked-by' },
  { from: 'op-query-agents', to: 'op-define-agent', type: 'blocked-by' },

  // Layer 5 contains + blocked-by
  { from: 'human-surfaces', to: 'ui-admin-surfaces', type: 'contains' },
  { from: 'human-surfaces', to: 'ui-user-surfaces', type: 'contains' },
  { from: 'ui-admin-surfaces', to: 'ui-dashboard', type: 'contains' },
  { from: 'ui-admin-surfaces', to: 'ui-intent-detail', type: 'contains' },
  { from: 'ui-admin-surfaces', to: 'ui-gap-surface', type: 'contains' },
  { from: 'ui-user-surfaces', to: 'ui-client-intake', type: 'contains' },
  { from: 'ui-dashboard', to: 'op-query-incomplete', type: 'blocked-by' },
  { from: 'ui-dashboard', to: 'op-render-human', type: 'blocked-by' },
  { from: 'ui-dashboard', to: 'op-query-agents', type: 'blocked-by' },
  { from: 'ui-intent-detail', to: 'op-build-projection', type: 'blocked-by' },
  { from: 'ui-intent-detail', to: 'op-render-human', type: 'blocked-by' },
  { from: 'ui-gap-surface', to: 'op-render-human', type: 'blocked-by' },
  { from: 'ui-client-intake', to: 'op-client-intake', type: 'blocked-by' },
  { from: 'ui-client-intake', to: 'op-render-human', type: 'blocked-by' },
  { from: 'ui-client-intake', to: 'mcp-tools', type: 'blocked-by' },

  // Layer 6 contains + blocked-by
  { from: 'mcp-server', to: 'mcp-endpoint', type: 'contains' },
  { from: 'mcp-server', to: 'mcp-tools', type: 'contains' },
  { from: 'mcp-server', to: 'mcp-connectors', type: 'contains' },
  { from: 'mcp-endpoint', to: 'foundation-tables', type: 'blocked-by' },
  { from: 'mcp-tools', to: 'mcp-endpoint', type: 'blocked-by' },
  { from: 'mcp-tools', to: 'op-query-incomplete', type: 'blocked-by' },
  { from: 'mcp-tools', to: 'op-query-skills', type: 'blocked-by' },
  { from: 'mcp-tools', to: 'op-build-projection', type: 'blocked-by' },
  { from: 'mcp-tools', to: 'op-create-intent', type: 'blocked-by' },
  { from: 'mcp-tools', to: 'op-record-expression', type: 'blocked-by' },
  { from: 'mcp-tools', to: 'op-link-expression', type: 'blocked-by' },
  { from: 'mcp-tools', to: 'op-create-gap', type: 'blocked-by' },
  { from: 'mcp-tools', to: 'op-client-intake', type: 'blocked-by' },
  { from: 'mcp-tools', to: 'op-query-agents', type: 'blocked-by' },
  { from: 'mcp-tools', to: 'op-create-decision', type: 'blocked-by' },
  { from: 'mcp-tools', to: 'op-supersede', type: 'blocked-by' },
  { from: 'mcp-tools', to: 'op-create-graph', type: 'blocked-by' },
  { from: 'mcp-tools', to: 'op-add-node-to-graph', type: 'blocked-by' },
  { from: 'mcp-tools', to: 'op-remove-node-from-graph', type: 'blocked-by' },
  { from: 'mcp-tools', to: 'op-query-graph-nodes', type: 'blocked-by' },
  { from: 'mcp-tools', to: 'op-node-graphs', type: 'blocked-by' },
  { from: 'mcp-tools', to: 'table-llm-providers', type: 'blocked-by' },
  { from: 'mcp-connectors', to: 'mcp-endpoint', type: 'blocked-by' },
  { from: 'mcp-connectors', to: 'table-skills', type: 'blocked-by' },

];

async function populate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Insert all nodes (ON CONFLICT updates build_instructions for existing installs)
    let inserted = 0;
    for (const node of nodes) {
      await client.query(`
        INSERT INTO gdd.nodes (id, type, name, description, test_condition, test_verification, build_instructions)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (id) DO UPDATE SET build_instructions = EXCLUDED.build_instructions
      `, [node.id, node.type, node.name, node.description, node.test_condition || null, node.test_verification || null, node.build_instructions || null]);
      inserted++;
    }
    console.log(`Inserted/updated ${inserted} nodes.`);

    // Insert all edges
    let edgesInserted = 0;
    for (const edge of edges) {
      // Check if edge already exists to avoid duplicates
      const existing = await client.query(
        'SELECT 1 FROM gdd.edges WHERE from_node = $1 AND to_node = $2 AND edge_type = $3 AND superseded_by IS NULL',
        [edge.from, edge.to, edge.type]
      );
      if (existing.rows.length === 0) {
        await client.query(`
          INSERT INTO gdd.edges (from_node, to_node, edge_type)
          VALUES ($1, $2, $3)
        `, [edge.from, edge.to, edge.type]);
        edgesInserted++;
      }
    }
    console.log(`Inserted ${edgesInserted} edges.`);

    await client.query('COMMIT');

    // Summary
    const nodeCount = await client.query('SELECT COUNT(*) FROM gdd.nodes');
    const edgeCount = await client.query('SELECT COUNT(*) FROM gdd.edges');
    console.log(`\nGraph populated: ${nodeCount.rows[0].count} nodes, ${edgeCount.rows[0].count} edges.`);

    // Show what's red (workable)
    const red = await client.query(`
      SELECT n.id, n.name FROM gdd.nodes n
      WHERE n.type NOT IN ('compose', 'expression', 'decision', 'signal')
      AND NOT EXISTS (SELECT 1 FROM gdd.edges e WHERE e.to_node = n.id AND e.edge_type = 'satisfies')
      AND NOT EXISTS (SELECT 1 FROM gdd.edges e WHERE e.to_node = n.id AND e.edge_type = 'supersedes')
      ORDER BY n.id
      LIMIT 10
    `);
    console.log(`\nFirst 10 red intents:`);
    red.rows.forEach(r => console.log(`  ${r.id}: ${r.name}`));

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
