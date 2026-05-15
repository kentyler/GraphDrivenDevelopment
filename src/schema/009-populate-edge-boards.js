const { pool } = require('../db');

// Intents for edge node & board infrastructure
const nodes = [
  // Tables
  { id: 'table-boards', type: 'define-table', name: 'Boards table', description: 'Stores board definitions — design spaces with declared boundaries.', test_condition: "Table gdd.boards exists with columns: id, created_at, created_by, statement, edge_statement, status.", test_verification: "SELECT * FROM information_schema.columns WHERE table_schema='gdd' AND table_name='boards'" },
  { id: 'table-edge-nodes', type: 'define-table', name: 'Edge nodes table', description: 'Stores edge nodes — boundary markers that should not be resolved.', test_condition: "Table gdd.edge_nodes exists with columns: id, board_id, created_at, created_by, name, content, related_nodes, weight, status, source_gap_id.", test_verification: "SELECT * FROM information_schema.columns WHERE table_schema='gdd' AND table_name='edge_nodes'" },
  { id: 'table-sensitivity-readings', type: 'define-table', name: 'Sensitivity readings table', description: 'Accumulating signal readings on edge nodes.', test_condition: "Table gdd.sensitivity_readings exists with columns: id, edge_node_id, read_at, read_by, signal, board_impact.", test_verification: "SELECT * FROM information_schema.columns WHERE table_schema='gdd' AND table_name='sensitivity_readings'" },
  { id: 'table-tension-readings', type: 'define-table', name: 'Tension readings table', description: 'Board-level tension readings.', test_condition: "Table gdd.tension_readings exists with columns: id, board_id, read_at, read_by, signal, edge_node_id, tension_character.", test_verification: "SELECT * FROM information_schema.columns WHERE table_schema='gdd' AND table_name='tension_readings'" },

  // Enums
  { id: 'type-edge-node-status', type: 'define-type', name: 'Edge node status enum', description: 'Lifecycle: active, expanded, converted.', test_condition: "Enum gdd.edge_node_status exists with values: active, expanded, converted.", test_verification: "SELECT enumlabel FROM pg_enum WHERE enumtypid = 'gdd.edge_node_status'::regtype" },
  { id: 'type-board-status', type: 'define-type', name: 'Board status enum', description: 'Board lifecycle: active, dormant, superseded.', test_condition: "Enum gdd.board_status exists with values: active, dormant, superseded.", test_verification: "SELECT enumlabel FROM pg_enum WHERE enumtypid = 'gdd.board_status'::regtype" },
  { id: 'type-board-impact', type: 'define-type', name: 'Board impact enum', description: 'Impact of sensitivity readings: stable, shifting, reorganizing.', test_condition: "Enum gdd.board_impact exists with values: stable, shifting, reorganizing.", test_verification: "SELECT enumlabel FROM pg_enum WHERE enumtypid = 'gdd.board_impact'::regtype" },
  { id: 'type-tension-character', type: 'define-type', name: 'Tension character enum', description: 'Character of board tension: generative, destabilizing, expansionary.', test_condition: "Enum gdd.tension_character exists with values: generative, destabilizing, expansionary.", test_verification: "SELECT enumlabel FROM pg_enum WHERE enumtypid = 'gdd.tension_character'::regtype" },

  // Operations
  { id: 'op-create-board', type: 'implement-operation', name: 'Create board', description: 'Create a board with statement and boundary register.', test_condition: 'Can create board with id, name, statement, edge_statement. Board is queryable.', test_verification: 'Integration test: create board, verify fields.' },
  { id: 'op-create-edge-node', type: 'implement-operation', name: 'Create edge node', description: 'Create an edge node on a board with content and weight.', test_condition: 'Can create edge node with board_id, name, content. Edge node is queryable. Does not appear in queryIncomplete.', test_verification: 'Integration test: create edge node, verify isolation from queryIncomplete.' },
  { id: 'op-convert-gap-to-edge', type: 'implement-operation', name: 'Convert gap to edge node', description: 'Convert a gap node to an edge node — marks a boundary that should not be resolved.', test_condition: 'Creates decision closing gap, creates edge node with source_gap_id, creates conversion event. Gap no longer in queryIncomplete.', test_verification: 'Integration test: create gap, convert, verify decision and edge node.' },
  { id: 'op-expand-edge-node', type: 'implement-operation', name: 'Expand edge node', description: 'Expand an active edge node into a gap — the boundary becomes interior work.', test_condition: 'Edge node status changes to expanded. New gap node created with board_id. Expansion event recorded.', test_verification: 'Integration test: create edge, expand, verify gap and status.' },
  { id: 'op-record-sensitivity', type: 'implement-operation', name: 'Record sensitivity reading', description: 'Record a signal observation on an edge node.', test_condition: 'Sensitivity reading created with edge_node_id, signal, board_impact. Visible in getEdgeNode.', test_verification: 'Integration test: create edge, record reading, verify in detail.' },
  { id: 'op-record-tension', type: 'implement-operation', name: 'Record tension reading', description: 'Record a tension observation on a board.', test_condition: 'Tension reading created with board_id, signal, tension_character. Visible in getBoard.', test_verification: 'Integration test: create board, record tension, verify in detail.' },
];

const edges = [
  // Tables blocked by foundation
  { from: 'table-boards', to: 'foundation-tables', type: 'blocked-by' },
  { from: 'table-edge-nodes', to: 'table-boards', type: 'blocked-by' },
  { from: 'table-sensitivity-readings', to: 'table-edge-nodes', type: 'blocked-by' },
  { from: 'table-tension-readings', to: 'table-boards', type: 'blocked-by' },

  // Enums blocked by foundation
  { from: 'type-edge-node-status', to: 'foundation-tables', type: 'blocked-by' },
  { from: 'type-board-status', to: 'foundation-tables', type: 'blocked-by' },
  { from: 'type-board-impact', to: 'foundation-tables', type: 'blocked-by' },
  { from: 'type-tension-character', to: 'foundation-tables', type: 'blocked-by' },

  // Operations blocked by tables
  { from: 'op-create-board', to: 'table-boards', type: 'blocked-by' },
  { from: 'op-create-edge-node', to: 'table-edge-nodes', type: 'blocked-by' },
  { from: 'op-create-edge-node', to: 'op-create-board', type: 'blocked-by' },
  { from: 'op-convert-gap-to-edge', to: 'op-create-edge-node', type: 'blocked-by' },
  { from: 'op-convert-gap-to-edge', to: 'op-create-decision', type: 'blocked-by' },
  { from: 'op-expand-edge-node', to: 'op-create-edge-node', type: 'blocked-by' },
  { from: 'op-expand-edge-node', to: 'op-create-gap', type: 'blocked-by' },
  { from: 'op-record-sensitivity', to: 'table-sensitivity-readings', type: 'blocked-by' },
  { from: 'op-record-tension', to: 'table-tension-readings', type: 'blocked-by' },

  // gdd-root contains these
  { from: 'foundation-tables', to: 'table-boards', type: 'contains' },
  { from: 'foundation-tables', to: 'table-edge-nodes', type: 'contains' },
  { from: 'foundation-tables', to: 'table-sensitivity-readings', type: 'contains' },
  { from: 'foundation-tables', to: 'table-tension-readings', type: 'contains' },
  { from: 'foundation-tables', to: 'type-edge-node-status', type: 'contains' },
  { from: 'foundation-tables', to: 'type-board-status', type: 'contains' },
  { from: 'foundation-tables', to: 'type-board-impact', type: 'contains' },
  { from: 'foundation-tables', to: 'type-tension-character', type: 'contains' },
];

// Seed edge node: the multi-board architecture vision
const seedEdgeNode = {
  id: 'edge-multi-board-architecture',
  board_id: 'default-board',
  created_by: 'system',
  name: 'Multi-board / multi-instance architecture',
  content: 'The current system operates as a single board on a single instance. The vision of multiple boards spanning multiple GDD instances — federated graphs, cross-instance edge nodes, distributed tension readings — is a design boundary, not a gap to be filled. This edge marks where the current system ends and the next architectural epoch begins. Premature work here would couple the single-instance implementation to speculative federation patterns.',
  weight: 0.9,
};

async function populate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Insert nodes
    let inserted = 0;
    for (const node of nodes) {
      await client.query(`
        INSERT INTO gdd.nodes (id, type, name, description, test_condition, test_verification, board_id)
        VALUES ($1, $2, $3, $4, $5, $6, 'default-board')
        ON CONFLICT (id) DO NOTHING
      `, [node.id, node.type, node.name, node.description, node.test_condition || null, node.test_verification || null]);
      inserted++;
    }
    console.log(`Inserted ${inserted} nodes.`);

    // Insert edges
    let edgesInserted = 0;
    for (const edge of edges) {
      // Check if edge already exists to avoid duplicates
      const existing = await client.query(
        'SELECT 1 FROM gdd.edges WHERE from_node = $1 AND to_node = $2 AND edge_type = $3',
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

    // Insert seed edge node
    await client.query(`
      INSERT INTO gdd.edge_nodes (id, board_id, created_by, name, content, weight)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (id) DO NOTHING
    `, [seedEdgeNode.id, seedEdgeNode.board_id, seedEdgeNode.created_by, seedEdgeNode.name, seedEdgeNode.content, seedEdgeNode.weight]);
    console.log('Inserted seed edge node: multi-board architecture vision.');

    // Record expressions on completed intents (tables and enums exist after migration)
    const completedIntents = [
      'table-boards', 'table-edge-nodes', 'table-sensitivity-readings', 'table-tension-readings',
      'type-edge-node-status', 'type-board-status', 'type-board-impact', 'type-tension-character',
      'op-create-board', 'op-create-edge-node', 'op-convert-gap-to-edge', 'op-expand-edge-node',
      'op-record-sensitivity', 'op-record-tension'
    ];

    const exprId = `expression-edge-boards-${Date.now()}`;
    await client.query(`
      INSERT INTO gdd.nodes (id, type, name, description, artifacts, board_id)
      VALUES ($1, 'expression', $2, $3, $4, 'default-board')
      ON CONFLICT (id) DO NOTHING
    `, [exprId, 'Edge nodes & boards implementation', 'Schema, operations, API, MCP tools, and UI for edge nodes and boards.',
        JSON.stringify({ files: ['005-edge-boards-enums.sql', '006-edge-boards-tables.sql', 'boardOperations.js', 'edgeNodeOperations.js'] })]);

    for (const intentId of completedIntents) {
      // Check if the intent exists before linking
      const exists = await client.query('SELECT 1 FROM gdd.nodes WHERE id = $1', [intentId]);
      if (exists.rows.length > 0) {
        await client.query(`
          INSERT INTO gdd.edges (from_node, to_node, edge_type)
          VALUES ($1, $2, 'satisfies')
        `, [exprId, intentId]);
      }
    }
    console.log(`Recorded expression satisfying ${completedIntents.length} intents.`);

    await client.query('COMMIT');

    // Summary
    const nodeCount = await client.query('SELECT COUNT(*) FROM gdd.nodes');
    const edgeCount = await client.query('SELECT COUNT(*) FROM gdd.edges');
    const edgeNodeCount = await client.query('SELECT COUNT(*) FROM gdd.edge_nodes');
    const boardCount = await client.query('SELECT COUNT(*) FROM gdd.boards');
    console.log(`\nGraph: ${nodeCount.rows[0].count} nodes, ${edgeCount.rows[0].count} edges, ${boardCount.rows[0].count} boards, ${edgeNodeCount.rows[0].count} edge nodes.`);

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
