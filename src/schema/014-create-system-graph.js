const { pool } = require('../db');

// All node IDs from 004-populate-graph.js and 009-populate-edge-boards.js
// that describe the GDD system itself (self-referential intents).
// This excludes expression nodes created by those scripts (they are artifacts, not intents).
const systemNodeIds = [
  // Layer 0: Foundation (from 004)
  'foundation-tables',
  'table-nodes', 'table-edges', 'table-graphs', 'table-graph-memberships',
  'table-agents', 'table-skills', 'table-llm-providers',
  'type-node-type', 'type-edge-type', 'type-agent-trust', 'type-agent-status',

  // Layer 0: Board/edge infrastructure (from 009)
  'table-boards', 'table-edge-nodes', 'table-sensitivity-readings', 'table-tension-readings',
  'type-edge-node-status', 'type-board-status', 'type-board-impact', 'type-tension-character',

  // Layer 1: Core Operations (from 004)
  'op-create-intent', 'op-create-edge', 'op-record-expression', 'op-link-expression',
  'op-traverse-dependencies', 'op-query-incomplete', 'op-query-skills',
  'op-create-gap', 'op-create-decision', 'op-supersede',
  'op-create-graph', 'op-add-node-to-graph', 'op-remove-node-from-graph',
  'op-query-graph-nodes', 'op-node-graphs',

  // Layer 1: Board/edge operations (from 009)
  'op-create-board', 'op-create-edge-node', 'op-convert-gap-to-edge',
  'op-expand-edge-node', 'op-record-sensitivity', 'op-record-tension',

  // Layer 2: Projection (from 004)
  'projection-mechanism', 'op-build-projection',

  // Layer 3: Dual Representation (from 004)
  'dual-repr', 'op-render-human', 'op-render-llm', 'op-translate-repr',

  // Layer 4: Actor Integration (from 004)
  'actor-integration', 'op-transduce-external', 'op-client-intake',
  'op-define-agent', 'op-activate-agent', 'op-query-agents',

  // Layer 5: Human Surfaces (from 004)
  'human-surfaces', 'ui-admin-surfaces', 'ui-user-surfaces',
  'ui-dashboard', 'ui-intent-detail', 'ui-gap-surface', 'ui-client-intake',

  // Layer 6: MCP Server (from 004)
  'mcp-server', 'mcp-endpoint', 'mcp-tools', 'mcp-connectors',

  // Root
  'gdd-root',
];

async function createSystemGraph() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Create the gdd-system graph
    await client.query(`
      INSERT INTO gdd.graphs (id, name, owner)
      VALUES ('gdd-system', 'GDD System Build', 'system')
      ON CONFLICT (id) DO NOTHING
    `);
    console.log('Created gdd-system graph.');

    // Add memberships for all system nodes
    let added = 0;
    let skipped = 0;
    for (const nodeId of systemNodeIds) {
      // Verify node exists before adding membership
      const exists = await client.query('SELECT 1 FROM gdd.nodes WHERE id = $1', [nodeId]);
      if (exists.rows.length > 0) {
        await client.query(`
          INSERT INTO gdd.graph_memberships (graph_id, node_id)
          VALUES ('gdd-system', $1)
          ON CONFLICT (graph_id, node_id) DO NOTHING
        `, [nodeId]);
        added++;
      } else {
        console.log(`  Warning: node '${nodeId}' not found, skipping membership.`);
        skipped++;
      }
    }

    await client.query('COMMIT');
    console.log(`Added ${added} nodes to gdd-system graph (${skipped} skipped).`);

    // Summary
    const count = await client.query(
      "SELECT COUNT(*) FROM gdd.graph_memberships WHERE graph_id = 'gdd-system'"
    );
    console.log(`\ngdd-system graph has ${count.rows[0].count} members.`);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('System graph creation failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

createSystemGraph();
