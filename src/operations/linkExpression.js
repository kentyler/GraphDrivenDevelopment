const { pool } = require('../db');

async function linkExpression({ expression_id, intent_id }) {
  if (!expression_id || !intent_id) {
    throw new Error('expression_id and intent_id are required');
  }

  // Verify expression exists and is type 'expression'
  const expr = await pool.query('SELECT id, type FROM gdd.nodes WHERE id = $1', [expression_id]);
  if (expr.rows.length === 0) {
    throw new Error(`Node '${expression_id}' does not exist`);
  }
  if (expr.rows[0].type !== 'expression') {
    throw new Error(`Node '${expression_id}' is not an expression node (type: ${expr.rows[0].type})`);
  }

  // Verify intent exists
  const intent = await pool.query('SELECT id FROM gdd.nodes WHERE id = $1', [intent_id]);
  if (intent.rows.length === 0) {
    throw new Error(`Intent '${intent_id}' does not exist`);
  }

  const result = await pool.query(`
    INSERT INTO gdd.edges (from_node, to_node, edge_type)
    VALUES ($1, $2, 'satisfies')
    RETURNING *
  `, [expression_id, intent_id]);

  return result.rows[0];
}

module.exports = { linkExpression };
