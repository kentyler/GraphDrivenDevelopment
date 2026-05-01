const { pool } = require('../db');

async function recordExpression({ intent_ids, artifacts, name, description, supersedes_id }) {
  if (!intent_ids || !Array.isArray(intent_ids) || intent_ids.length === 0) {
    throw new Error('intent_ids[] is required (non-empty array)');
  }
  if (!artifacts) {
    throw new Error('artifacts (JSONB) is required');
  }
  if (!name) {
    throw new Error('name is required');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Verify all intent_ids exist
    for (const intentId of intent_ids) {
      const exists = await client.query('SELECT id FROM gdd.nodes WHERE id = $1', [intentId]);
      if (exists.rows.length === 0) {
        throw new Error(`Intent '${intentId}' does not exist`);
      }
    }

    // Create expression node
    const expressionId = `expr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const result = await client.query(`
      INSERT INTO gdd.nodes (id, type, name, description, artifacts)
      VALUES ($1, 'expression', $2, $3, $4)
      RETURNING *
    `, [expressionId, name, description || null, JSON.stringify(artifacts)]);

    // Create satisfies edges to each intent
    for (const intentId of intent_ids) {
      await client.query(`
        INSERT INTO gdd.edges (from_node, to_node, edge_type)
        VALUES ($1, $2, 'satisfies')
      `, [expressionId, intentId]);
    }

    // Create supersedes edge if replacing a prior expression
    if (supersedes_id) {
      const prev = await client.query('SELECT id FROM gdd.nodes WHERE id = $1', [supersedes_id]);
      if (prev.rows.length === 0) {
        throw new Error(`Supersedes target '${supersedes_id}' does not exist`);
      }
      await client.query(`
        INSERT INTO gdd.edges (from_node, to_node, edge_type)
        VALUES ($1, $2, 'supersedes')
      `, [expressionId, supersedes_id]);
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

module.exports = { recordExpression };
