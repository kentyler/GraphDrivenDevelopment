const { pool } = require('../db');

async function supersedeEdge({ old_edge_id, from_node, to_node, edge_type, description, created_by }) {
  if (!old_edge_id) throw new Error('old_edge_id is required');

  // Verify old edge exists and is not already superseded
  const oldEdge = await pool.query('SELECT * FROM gdd.edges WHERE id = $1', [old_edge_id]);
  if (oldEdge.rows.length === 0) throw new Error(`Edge '${old_edge_id}' does not exist`);
  if (oldEdge.rows[0].superseded_by) {
    throw new Error(`Edge '${old_edge_id}' is already superseded by '${oldEdge.rows[0].superseded_by}'`);
  }

  const old = oldEdge.rows[0];

  // New edge inherits from_node/to_node/edge_type from old unless overridden
  const newFrom = from_node || old.from_node;
  const newTo = to_node || old.to_node;
  const newType = edge_type || old.edge_type;

  // Create replacement edge
  const newEdge = await pool.query(`
    INSERT INTO gdd.edges (from_node, to_node, edge_type, description, created_by)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `, [newFrom, newTo, newType, description || null, created_by || null]);

  // Mark old edge as superseded
  await pool.query('UPDATE gdd.edges SET superseded_by = $1 WHERE id = $2', [newEdge.rows[0].id, old_edge_id]);

  return { old_edge: { ...old, superseded_by: newEdge.rows[0].id }, new_edge: newEdge.rows[0] };
}

module.exports = { supersedeEdge };
