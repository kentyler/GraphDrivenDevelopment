const { pool } = require('../db');

// All nodes from Layers 0-7 of intent-graph-layers.md
const nodes = [
  // Layer 0: Foundation
  { id: 'foundation-tables', type: 'compose', name: 'Graph foundation tables', description: 'The database tables that store the global intent graph.' },
  { id: 'table-nodes', type: 'define-table', name: 'Intent nodes table', description: 'Stores all nodes in the global graph.', test_condition: 'Table exists with columns: id, type, name, description, test_condition, test_verification, notes, artifacts.', test_verification: "SELECT * FROM information_schema.columns WHERE table_schema='gdd' AND table_name='nodes'" },
  { id: 'table-edges', type: 'define-table', name: 'Intent edges table', description: 'Stores directed edges between nodes.', test_condition: 'Table exists with columns: id, from_node, to_node, edge_type', test_verification: "SELECT * FROM information_schema.columns WHERE table_schema='gdd' AND table_name='edges'" },
  { id: 'table-graphs', type: 'define-table', name: 'Graphs table', description: 'Stores graph identities.', test_condition: 'Table exists with columns: id, name, owner, created_at', test_verification: "SELECT * FROM information_schema.columns WHERE table_schema='gdd' AND table_name='graphs'" },
  { id: 'table-graph-memberships', type: 'define-table', name: 'Graph memberships table', description: 'Join table linking nodes to graphs.', test_condition: 'Table exists with columns: graph_id, node_id, unique constraint on (graph_id, node_id)', test_verification: "SELECT * FROM information_schema.columns WHERE table_schema='gdd' AND table_name='graph_memberships'" },
  { id: 'table-agents', type: 'define-table', name: 'Agents table', description: 'Stores agent definitions.', test_condition: 'Table exists with columns: id, name, scope, trust_level, trigger, status, created_at', test_verification: "SELECT * FROM information_schema.columns WHERE table_schema='gdd' AND table_name='agents'" },
  { id: 'table-skills', type: 'define-table', name: 'Skill directory table', description: 'Indexes all skill files and external capabilities.', test_condition: 'Table exists with columns: id, name, description, file_path, endpoint, category, created_at', test_verification: "SELECT * FROM information_schema.columns WHERE table_schema='gdd' AND table_name='skills'" },
  { id: 'table-llm-providers', type: 'define-table', name: 'LLM providers table', description: 'Stores LLM provider configurations.', test_condition: 'Table exists with columns: id, name, provider, api_key, model, is_active, created_at', test_verification: "SELECT * FROM information_schema.columns WHERE table_schema='gdd' AND table_name='llm_providers'" },
  { id: 'type-node-type', type: 'define-type', name: 'Node type enum', description: 'All 20 node types from the fixed vocabulary.', test_condition: 'Enum type exists in database with all 20 values', test_verification: "SELECT enumlabel FROM pg_enum WHERE enumtypid = 'gdd.node_type'::regtype" },
  { id: 'type-edge-type', type: 'define-type', name: 'Edge type enum', description: 'The seven edge types.', test_condition: 'Enum type exists in database with all seven values', test_verification: "SELECT enumlabel FROM pg_enum WHERE enumtypid = 'gdd.edge_type'::regtype" },
  { id: 'type-agent-trust', type: 'define-type', name: 'Agent trust level enum', description: 'What an agent can write back: full, express-only, gaps-only.', test_condition: 'Enum type exists in database', test_verification: "SELECT enumlabel FROM pg_enum WHERE enumtypid = 'gdd.agent_trust'::regtype" },
  { id: 'type-agent-status', type: 'define-type', name: 'Agent status enum', description: 'Agent lifecycle: defined, active, paused.', test_condition: 'Enum type exists in database', test_verification: "SELECT enumlabel FROM pg_enum WHERE enumtypid = 'gdd.agent_status'::regtype" },

  // Layer 1: Core Operations
  { id: 'op-create-intent', type: 'implement-operation', name: 'Create intent node', description: 'Insert a new node into the global graph with type validation.', test_condition: 'Can create nodes of all types with proper validation. Rejects intent-type creation if test_condition is null/empty.', test_verification: 'Integration test: create intent, gap, decision, signal, expression, compose nodes.' },
  { id: 'op-create-edge', type: 'implement-operation', name: 'Create edge', description: 'Insert a directed edge between two nodes.', test_condition: 'Can create edges of all seven types. Validates both nodes exist.', test_verification: 'Integration test: create nodes, add edges, verify structure.' },
  { id: 'op-record-expression', type: 'implement-operation', name: 'Record expression', description: 'Create expression node with satisfies edges to specified intents.', test_condition: 'Creates expression node and satisfies edges. Linked intents become green.', test_verification: 'Integration test: create chain, record expression, verify green status.' },
  { id: 'op-link-expression', type: 'implement-operation', name: 'Link expression to additional intent', description: 'Add a satisfies edge from an existing expression to another intent.', test_condition: 'Linking expression to intent creates satisfies edge. Intent becomes green. Rejects non-expression nodes.', test_verification: 'Integration test: link expression to additional intent, verify green.' },
  { id: 'op-traverse-dependencies', type: 'implement-traversal', name: 'Traverse dependency chain', description: 'Traverse blocked-by edges in both directions.', test_condition: 'Given chain A->B->C->D, traversing from C returns A,B upstream and D downstream.', test_verification: 'Integration test with a known chain.' },
  { id: 'op-query-incomplete', type: 'implement-traversal', name: 'Query incomplete intents', description: 'Return all red, current intents and gaps.', test_condition: 'Returns only red, current intents and gaps. Excludes expression, decision, signal nodes. Supports workable filter. Orders by downstream count.', test_verification: 'Integration test with mixed node states.' },
  { id: 'op-query-skills', type: 'implement-traversal', name: 'Query skill directory', description: 'Return skill entries from gdd.skills with optional category filter.', test_condition: 'Returns all skills unfiltered, filtered by category, empty for no matches.', test_verification: 'Insert test skills, verify queries.' },
  { id: 'op-create-gap', type: 'implement-operation', name: 'Create gap node', description: 'Convenience for creating gap nodes with required notes.', test_condition: 'Creates gap with null test_condition and required notes. Rejects if notes empty.', test_verification: 'Create gap, verify in queryIncomplete.' },
  { id: 'op-create-decision', type: 'implement-operation', name: 'Create decision node', description: 'Create decision node with optional closes edges to gaps.', test_condition: 'Creates decision with notes. Creates closes edges if closes[] provided. Not in queryIncomplete.', test_verification: 'Create decision with closes[], verify edges and exclusion from queryIncomplete.' },
  { id: 'op-supersede', type: 'implement-operation', name: 'Supersede intent', description: 'Create supersedes edge marking old intent as superseded.', test_condition: 'Creates supersedes edge. Old intent excluded from queryIncomplete.', test_verification: 'Supersede intent, verify exclusion.' },
  { id: 'op-create-graph', type: 'implement-operation', name: 'Create graph', description: 'Create a graph identity in gdd.graphs.', test_condition: 'Can create and retrieve graph by id.', test_verification: 'Integration test: create graph, verify fields.' },
  { id: 'op-add-node-to-graph', type: 'implement-operation', name: 'Add node to graph', description: 'Create membership linking node to graph.', test_condition: 'Can add node to graph. Same node in multiple graphs works. Duplicate rejected.', test_verification: 'Integration test with memberships.' },
  { id: 'op-remove-node-from-graph', type: 'implement-operation', name: 'Remove node from graph', description: 'Delete membership. Node itself not deleted.', test_condition: 'Remove from one graph, still in other graphs and nodes table.', test_verification: 'Integration test: add to two, remove from one.' },
  { id: 'op-query-graph-nodes', type: 'implement-traversal', name: 'Query graph nodes', description: 'Return all nodes belonging to a graph.', test_condition: 'Returns all nodes in graph. Supports type filter. Empty for empty graph.', test_verification: 'Integration test with type filters.' },
  { id: 'op-node-graphs', type: 'implement-traversal', name: "Query node's graphs", description: 'Return all graphs a node belongs to.', test_condition: 'Returns all graphs for a node. Empty if no memberships.', test_verification: 'Integration test: node in two graphs.' },

  // Layer 2: Projection
  { id: 'projection-mechanism', type: 'compose', name: 'Projection mechanism', description: 'The ability to construct a situated view of the graph from a specific vantage point.' },
  { id: 'op-build-projection', type: 'implement-projection', name: 'Build projection from intent', description: 'Construct projection: intent, dependencies, red/green status, test conditions, gaps, decisions, expressions, supersession.', test_condition: 'Projection from middle of chain includes all context. Supports graph_id scoping.', test_verification: 'Integration test: build known graph, project from middle node.' },

  // Layer 3: Dual Representation
  { id: 'dual-repr', type: 'compose', name: 'Dual representation', description: 'LLM-legible and human-legible representations of the graph.' },
  { id: 'op-render-human', type: 'translate', name: 'Render human-legible view', description: 'Produce human-readable summary from projection.', test_condition: 'Projection with 5 intents (2 green, 2 red workable, 1 blocked) produces understandable summary.', test_verification: 'Generate summary from known projection.' },
  { id: 'op-render-llm', type: 'translate', name: 'Render LLM-legible view', description: 'Produce dense structured JSON from projection.', test_condition: 'Includes all node fields, edges, status, test conditions. LLM can identify priority work.', test_verification: 'Feed to LLM, verify correct identification.' },
  { id: 'op-translate-repr', type: 'translate', name: 'Translate between representations', description: 'Bidirectional: human-to-graph (LLM) and graph-to-human (deterministic).', test_condition: 'NL requirement produces intent nodes. Graph mutation produces readable description.', test_verification: 'Round-trip test.' },

  // Layer 4: Actor Integration
  { id: 'actor-integration', type: 'compose', name: 'Actor integration', description: 'All actor types interact through the graph.' },
  { id: 'op-transduce-external', type: 'implement-operation', name: 'Transduce external force', description: 'Create signal node for external event, then interpret into graph elements via LLM.', test_condition: 'External event creates signal node plus operational elements linked back to signal.', test_verification: 'Integration test: simulate event, verify signal and graph elements.' },
  { id: 'op-client-intake', type: 'implement-operation', name: 'Client intake', description: 'Natural language transduced into graph elements via LLM.', test_condition: 'Clear requirement creates intent with test. Vague input creates gap.', test_verification: 'Integration test: clear and vague inputs.' },
  { id: 'op-define-agent', type: 'implement-operation', name: 'Define agent', description: 'Create agent definition with scope, trust, trigger.', test_condition: 'Can create agent with scope and trust. Agent is queryable.', test_verification: 'Integration test: define agent, verify metadata.' },
  { id: 'op-activate-agent', type: 'implement-operation', name: 'Activate agent', description: 'Start agent running against scoped jurisdiction.', test_condition: 'Agent with 2 red intents produces expressions. Stops when green or gap. Respects trust.', test_verification: 'Integration test: activate, verify scope and trust boundaries.' },
  { id: 'op-query-agents', type: 'implement-operation', name: 'Query agents', description: 'List agents with state, filterable by status and scope overlap.', test_condition: 'Can list, filter by status, filter by scope overlap. Returns gap counts.', test_verification: 'Integration test: multiple agents, verify filters.' },

  // Layer 5: Human Surfaces
  { id: 'human-surfaces', type: 'compose', name: 'Human-facing surfaces', description: 'Surfaces for human actors to perceive and act on the graph.' },
  { id: 'ui-admin-surfaces', type: 'compose', name: 'Admin surfaces', description: 'Backend-served for direct graph actors.' },
  { id: 'ui-user-surfaces', type: 'compose', name: 'User-facing surfaces', description: 'External MCP clients for natural language actors.' },
  { id: 'ui-dashboard', type: 'implement-operation', name: 'Dashboard surface', description: 'Primary entry: what is red, ordered by impact.', test_condition: 'Human can see: what needs work, gap count, active agents, recent activity.', test_verification: 'Create mixed graph, verify dashboard content.' },
  { id: 'ui-intent-detail', type: 'implement-operation', name: 'Intent detail surface', description: 'Full projection for selected intent.', test_condition: 'Human can see: intent, test condition, deps, decisions, expressions.', test_verification: 'Build projection, verify all context present.' },
  { id: 'ui-gap-surface', type: 'implement-operation', name: 'Gap surface', description: 'All gaps with notes, blocked work, and resolution status.', test_condition: 'Human can see every unresolved gap, its notes, and what it blocks.', test_verification: 'Create gaps resolved and unresolved, verify display.' },
  { id: 'ui-client-intake', type: 'implement-operation', name: 'Client intake surface', description: 'Natural language entry via MCP.', test_condition: 'User states requirement in NL, sees created intents/gaps. Transduction visible.', test_verification: 'Simulate client input, verify feedback.' },

  // Layer 6: MCP Server
  { id: 'mcp-server', type: 'compose', name: 'MCP server for execution surfaces', description: 'Exposes graph operations over Model Context Protocol.' },
  { id: 'mcp-endpoint', type: 'implement-endpoint', name: 'MCP protocol endpoint', description: 'Express endpoint serving MCP protocol.', test_condition: '/mcp responds to handshake and returns tool list.', test_verification: 'Send initialize request, verify capabilities.' },
  { id: 'mcp-tools', type: 'implement-operation', name: 'MCP tool definitions', description: 'Register all graph operations as MCP tools.', test_condition: 'All tools registered and callable. Same results as REST endpoints.', test_verification: 'Call each tool, compare with REST.' },
  { id: 'mcp-connectors', type: 'implement-operation', name: 'Connector skill file generation', description: 'Write connector skill files when external tools connect.', test_condition: 'After connecting tool, skill file exists and gdd.skills has entry.', test_verification: 'Connect test client, verify skill file and registry.' },

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

    // Insert all nodes
    let inserted = 0;
    for (const node of nodes) {
      await client.query(`
        INSERT INTO gdd.nodes (id, type, name, description, test_condition, test_verification)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (id) DO NOTHING
      `, [node.id, node.type, node.name, node.description, node.test_condition || null, node.test_verification || null]);
      inserted++;
    }
    console.log(`Inserted ${inserted} nodes.`);

    // Insert all edges
    let edgesInserted = 0;
    for (const edge of edges) {
      await client.query(`
        INSERT INTO gdd.edges (from_node, to_node, edge_type)
        VALUES ($1, $2, $3)
      `, [edge.from, edge.to, edge.type]);
      edgesInserted++;
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
