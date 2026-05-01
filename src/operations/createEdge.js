const { pool } = require('../db');

const VALID_EDGE_TYPES = ['blocked-by', 'contains', 'tensions-with', 'refines', 'supersedes', 'closes', 'satisfies'];

async function createEdge({ from_node, to_node, edge_type }) {
  if (!from_node || !to_node || !edge_type) {
    throw new Error('from_node, to_node, and edge_type are required');
  }

  if (!VALID_EDGE_TYPES.includes(edge_type)) {
    throw new Error(`Invalid edge_type '${edge_type}'. Must be one of: ${VALID_EDGE_TYPES.join(', ')}`);
  }

  // Validate both nodes exist
  const fromExists = await pool.query('SELECT id FROM gdd.nodes WHERE id = $1', [from_node]);
  if (fromExists.rows.length === 0) {
    throw new Error(`from_node '${from_node}' does not exist`);
  }

  const toExists = await pool.query('SELECT id FROM gdd.nodes WHERE id = $1', [to_node]);
  if (toExists.rows.length === 0) {
    throw new Error(`to_node '${to_node}' does not exist`);
  }

  const result = await pool.query(`
    INSERT INTO gdd.edges (from_node, to_node, edge_type)
    VALUES ($1, $2, $3)
    RETURNING *
  `, [from_node, to_node, edge_type]);

  return result.rows[0];
}

module.exports = { createEdge };
