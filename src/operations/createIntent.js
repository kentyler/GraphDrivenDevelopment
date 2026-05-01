const { pool } = require('../db');

// Intent-category types that require test_condition
const INTENT_TYPES = [
  'define-table', 'define-type', 'define-schema',
  'implement-operation', 'implement-endpoint', 'implement-traversal',
  'implement-projection', 'implement-mutation',
  'integrate', 'derive', 'translate',
  'constrain-permission', 'constrain-invariant',
  'establish-convention', 'define-vocabulary'
];

async function createIntent({ id, type, name, description, test_condition, test_verification, notes, artifacts, blocked_by }) {
  // Validation
  if (!id || !type || !name) {
    throw new Error('id, type, and name are required');
  }

  // Intent types require test_condition
  if (INTENT_TYPES.includes(type)) {
    if (!test_condition) {
      throw new Error(`Intent type '${type}' requires a non-empty test_condition`);
    }
  }

  // Gap, signal require notes
  if ((type === 'gap' || type === 'signal') && !notes) {
    throw new Error(`Type '${type}' requires notes`);
  }

  // Decision requires notes
  if (type === 'decision' && !notes) {
    throw new Error("Type 'decision' requires notes");
  }

  // Expression requires artifacts
  if (type === 'expression' && !artifacts) {
    throw new Error("Type 'expression' requires artifacts (JSONB)");
  }

  // Gap, decision, signal, expression, compose have null test_condition
  if (['gap', 'decision', 'signal', 'expression', 'compose'].includes(type)) {
    test_condition = null;
    test_verification = null;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(`
      INSERT INTO gdd.nodes (id, type, name, description, test_condition, test_verification, notes, artifacts)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [id, type, name, description || null, test_condition || null, test_verification || null, notes || null, artifacts ? JSON.stringify(artifacts) : null]);

    // Create blocked-by edges if provided
    if (blocked_by && blocked_by.length > 0) {
      for (const dep of blocked_by) {
        await client.query(`
          INSERT INTO gdd.edges (from_node, to_node, edge_type)
          VALUES ($1, $2, 'blocked-by')
        `, [id, dep]);
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

module.exports = { createIntent, INTENT_TYPES };
