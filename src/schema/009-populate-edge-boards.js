const { pool } = require('../db');

// Intents for edge node & board infrastructure
const nodes = [
  // Tables
  { id: 'table-boards', type: 'define-table', name: 'Boards table', description: 'Stores board definitions -- design spaces whose boundaries are derived from their axiom sets.', test_condition: "Table gdd.boards exists with columns: id, created_at, created_by, statement, status.", test_verification: "SELECT * FROM information_schema.columns WHERE table_schema='gdd' AND table_name='boards'", build_instructions: "CREATE TABLE gdd.boards with columns: id (TEXT PK), created_at (TIMESTAMP DEFAULT NOW()), created_by (TEXT), statement (TEXT), status (gdd.board_status NOT NULL DEFAULT 'active'). Also ALTER TABLE gdd.nodes ADD COLUMN board_id TEXT REFERENCES gdd.boards(id) if not already present." },
  { id: 'table-edge-nodes', type: 'define-table', name: 'Edge nodes table', description: 'Stores edge nodes -- boundary markers that should not be resolved.', test_condition: "Table gdd.edge_nodes exists with columns: id, board_id, created_at, created_by, name, content, related_nodes, weight, status, source_gap_id.", test_verification: "SELECT * FROM information_schema.columns WHERE table_schema='gdd' AND table_name='edge_nodes'", build_instructions: "CREATE TABLE gdd.edge_nodes with columns: id (TEXT PK, default gen_random_uuid()::text), board_id (TEXT NOT NULL FK to gdd.boards), created_at (TIMESTAMP DEFAULT NOW()), created_by (TEXT), name (TEXT NOT NULL), content (TEXT), related_nodes (TEXT[]), weight (NUMERIC DEFAULT 0.5), status (gdd.edge_node_status NOT NULL DEFAULT 'active'), source_gap_id (TEXT FK to gdd.nodes)." },
  { id: 'table-sensitivity-readings', type: 'define-table', name: 'Sensitivity readings table', description: 'Accumulating signal readings on edge nodes.', test_condition: "Table gdd.sensitivity_readings exists with columns: id, edge_node_id, read_at, read_by, signal, board_impact.", test_verification: "SELECT * FROM information_schema.columns WHERE table_schema='gdd' AND table_name='sensitivity_readings'", build_instructions: "CREATE TABLE gdd.sensitivity_readings with columns: id (TEXT PK, default gen_random_uuid()::text), edge_node_id (TEXT NOT NULL FK to gdd.edge_nodes), read_at (TIMESTAMP DEFAULT NOW()), read_by (TEXT), signal (TEXT NOT NULL), board_impact (gdd.board_impact DEFAULT 'stable')." },
  { id: 'table-tension-readings', type: 'define-table', name: 'Tension readings table', description: 'Board-level tension readings.', test_condition: "Table gdd.tension_readings exists with columns: id, board_id, read_at, read_by, signal, edge_node_id, tension_character.", test_verification: "SELECT * FROM information_schema.columns WHERE table_schema='gdd' AND table_name='tension_readings'", build_instructions: "CREATE TABLE gdd.tension_readings with columns: id (TEXT PK, default gen_random_uuid()::text), board_id (TEXT NOT NULL FK to gdd.boards), read_at (TIMESTAMP DEFAULT NOW()), read_by (TEXT), signal (TEXT NOT NULL), edge_node_id (TEXT FK to gdd.edge_nodes), tension_character (gdd.tension_character)." },

  // Enums
  { id: 'type-edge-node-status', type: 'define-type', name: 'Edge node status enum', description: 'Lifecycle: active, expanded, converted.', test_condition: "Enum gdd.edge_node_status exists with values: active, expanded, converted.", test_verification: "SELECT enumlabel FROM pg_enum WHERE enumtypid = 'gdd.edge_node_status'::regtype", build_instructions: "CREATE TYPE gdd.edge_node_status AS ENUM ('active', 'expanded', 'converted')." },
  { id: 'type-board-status', type: 'define-type', name: 'Board status enum', description: 'Board lifecycle: active, dormant, superseded.', test_condition: "Enum gdd.board_status exists with values: active, dormant, superseded.", test_verification: "SELECT enumlabel FROM pg_enum WHERE enumtypid = 'gdd.board_status'::regtype", build_instructions: "CREATE TYPE gdd.board_status AS ENUM ('active', 'dormant', 'superseded')." },
  { id: 'type-board-impact', type: 'define-type', name: 'Board impact enum', description: 'Impact of sensitivity readings: stable, shifting, reorganizing.', test_condition: "Enum gdd.board_impact exists with values: stable, shifting, reorganizing.", test_verification: "SELECT enumlabel FROM pg_enum WHERE enumtypid = 'gdd.board_impact'::regtype", build_instructions: "CREATE TYPE gdd.board_impact AS ENUM ('stable', 'shifting', 'reorganizing')." },
  { id: 'type-tension-character', type: 'define-type', name: 'Tension character enum', description: 'Character of board tension: generative, destabilizing, expansionary.', test_condition: "Enum gdd.tension_character exists with values: generative, destabilizing, expansionary.", test_verification: "SELECT enumlabel FROM pg_enum WHERE enumtypid = 'gdd.tension_character'::regtype", build_instructions: "CREATE TYPE gdd.tension_character AS ENUM ('generative', 'destabilizing', 'expansionary')." },

  // Operations
  { id: 'op-create-board', type: 'implement-operation', name: 'Create board', description: 'Create a board with statement. Boundaries are derived from axioms, not proclaimed.', test_condition: 'Can create board with id, name, statement. Board is queryable.', test_verification: 'Integration test: create board, verify fields.', build_instructions: "Implement createBoard(params) that inserts into gdd.boards. Accept: id, name, statement (optional), created_by (optional). Default status to 'active'. Return the created board row." },
  { id: 'op-create-edge-node', type: 'implement-operation', name: 'Create edge node', description: 'Create an edge node on a board with content and weight.', test_condition: 'Can create edge node with board_id, name, content. Edge node is queryable. Does not appear in queryIncomplete.', test_verification: 'Integration test: create edge node, verify isolation from queryIncomplete.', build_instructions: "Implement createEdgeNode(params) that inserts into gdd.edge_nodes. Accept: name, board_id, id (optional -- generate if not provided), content (optional), related_nodes (optional array), weight (optional, default 0.5), created_by (optional). Default status to 'active'. Validate board exists. Return the created edge node." },
  { id: 'op-convert-gap-to-edge', type: 'implement-operation', name: 'Convert gap to edge node', description: 'Convert a gap node to an edge node -- marks a boundary that should not be resolved.', test_condition: 'Creates decision closing gap, creates edge node with source_gap_id, creates conversion event. Gap no longer in queryIncomplete.', test_verification: 'Integration test: create gap, convert, verify decision and edge node.', build_instructions: "Implement convertGapToEdge(params) in a transaction. Accept: gap_id, board_id, content (optional), description (optional), failed_articulation_attempts (optional array), created_by (optional). Steps: (1) validate gap exists and is type='gap', (2) create decision node closing the gap (with closes edge), (3) create edge node with source_gap_id = gap_id, (4) record conversion event in gdd.conversion_events. Return { edge_node, decision }." },
  { id: 'op-expand-edge-node', type: 'implement-operation', name: 'Expand edge node', description: 'Expand an active edge node into a gap -- the boundary becomes interior work.', test_condition: 'Edge node status changes to expanded. New gap node created with board_id. Expansion event recorded.', test_verification: 'Integration test: create edge, expand, verify gap and status.', build_instructions: "Implement expandEdgeNode(params) in a transaction. Accept: edge_node_id, gap_name, gap_notes, description (optional), created_by (optional). Validate edge node exists and status is 'active'. Steps: (1) update edge node status to 'expanded', (2) create gap node with board_id from edge node, (3) record expansion event in gdd.expansion_events. Return { edge_node, gap }." },
  { id: 'op-record-sensitivity', type: 'implement-operation', name: 'Record sensitivity reading', description: 'Record a signal observation on an edge node.', test_condition: 'Sensitivity reading created with edge_node_id, signal, board_impact. Visible in getEdgeNode.', test_verification: 'Integration test: create edge, record reading, verify in detail.', build_instructions: "Implement recordSensitivityReading(params) that inserts into gdd.sensitivity_readings. Accept: edge_node_id, signal, read_by (optional), board_impact (optional, default 'stable'). Validate edge node exists. Return the created reading." },
  { id: 'op-record-tension', type: 'implement-operation', name: 'Record tension reading', description: 'Record a tension observation on a board.', test_condition: 'Tension reading created with board_id, signal, tension_character. Visible in getBoard.', test_verification: 'Integration test: create board, record tension, verify in detail.', build_instructions: "Implement recordTensionReading(params) that inserts into gdd.tension_readings. Accept: board_id, signal, read_by (optional), edge_node_id (optional), tension_character (optional). Validate board exists. Return the created reading." },
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
  content: 'The current system operates as a single board on a single instance. The vision of multiple boards spanning multiple GDD instances -- federated graphs, cross-instance edge nodes, distributed tension readings -- is a design boundary, not a gap to be filled. This edge marks where the current system ends and the next architectural epoch begins. Premature work here would couple the single-instance implementation to speculative federation patterns.',
  weight: 0.9,
};

async function populate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Insert nodes (ON CONFLICT updates build_instructions for existing installs)
    let inserted = 0;
    for (const node of nodes) {
      await client.query(`
        INSERT INTO gdd.nodes (id, type, name, description, test_condition, test_verification, build_instructions, board_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'default-board')
        ON CONFLICT (id) DO UPDATE SET build_instructions = EXCLUDED.build_instructions
      `, [node.id, node.type, node.name, node.description, node.test_condition || null, node.test_verification || null, node.build_instructions || null]);
      inserted++;
    }
    console.log(`Inserted/updated ${inserted} nodes.`);

    // Insert edges
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
