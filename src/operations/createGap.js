const { pool } = require('../db');

async function createGap({ id, name, notes, blocked_by }) {
  if (!name) throw new Error('name is required');
  if (!notes) throw new Error('notes is required for gap nodes');

  const nodeId = id || `gap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(`
      INSERT INTO gdd.nodes (id, type, name, notes)
      VALUES ($1, 'gap', $2, $3)
      RETURNING *
    `, [nodeId, name, notes]);

    if (blocked_by && blocked_by.length > 0) {
      for (const dep of blocked_by) {
        await client.query(`
          INSERT INTO gdd.edges (from_node, to_node, edge_type)
          VALUES ($1, $2, 'blocked-by')
        `, [nodeId, dep]);
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

module.exports = { createGap };
