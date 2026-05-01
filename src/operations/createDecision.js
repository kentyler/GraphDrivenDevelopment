const { pool } = require('../db');

async function createDecision({ id, name, description, notes, closes }) {
  if (!name) throw new Error('name is required');
  if (!notes) throw new Error('notes is required for decision nodes');

  const nodeId = id || `decision-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(`
      INSERT INTO gdd.nodes (id, type, name, description, notes)
      VALUES ($1, 'decision', $2, $3, $4)
      RETURNING *
    `, [nodeId, name, description || null, notes]);

    // Create closes edges to gaps
    if (closes && closes.length > 0) {
      for (const gapId of closes) {
        await client.query(`
          INSERT INTO gdd.edges (from_node, to_node, edge_type)
          VALUES ($1, $2, 'closes')
        `, [nodeId, gapId]);
      }
    }

    await client.query('COMMIT');
    return result.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { createDecision };
