const { pool } = require('../db');

async function supersedeIntent({ new_intent_id, old_intent_id }) {
  if (!new_intent_id || !old_intent_id) {
    throw new Error('new_intent_id and old_intent_id are required');
  }

  // Verify both exist
  const newNode = await pool.query('SELECT id FROM gdd.nodes WHERE id = $1', [new_intent_id]);
  if (newNode.rows.length === 0) throw new Error(`Node '${new_intent_id}' does not exist`);

  const oldNode = await pool.query('SELECT id FROM gdd.nodes WHERE id = $1', [old_intent_id]);
  if (oldNode.rows.length === 0) throw new Error(`Node '${old_intent_id}' does not exist`);

  const result = await pool.query(`
    INSERT INTO gdd.edges (from_node, to_node, edge_type)
    VALUES ($1, $2, 'supersedes')
    RETURNING *
  `, [new_intent_id, old_intent_id]);

  return result.rows[0];
}

module.exports = { supersedeIntent };
