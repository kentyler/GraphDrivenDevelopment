const { pool } = require('../db');
const { INTENT_TYPES } = require('./createIntent');

// Set the test condition on an untested intent. Write-once: once set,
// test_condition is immutable. To change a test, supersede the intent.
// This enforces legibility -- every LLM session can see the test that
// was in effect when an expression was recorded, because it never changes.
async function setTestCondition({ intent_id, test_condition, test_verification }) {
  if (!intent_id) {
    throw new Error('intent_id is required');
  }
  if (!test_condition || !test_condition.trim()) {
    throw new Error('test_condition is required (non-empty string)');
  }

  // Fetch the intent
  const node = await pool.query('SELECT * FROM gdd.nodes WHERE id = $1', [intent_id]);
  if (node.rows.length === 0) {
    throw new Error(`Node '${intent_id}' does not exist`);
  }

  const intent = node.rows[0];

  // Must be an intent type
  if (!INTENT_TYPES.includes(intent.type)) {
    throw new Error(`Node '${intent_id}' is type '${intent.type}', not an intent type. Only intent types can have test conditions.`);
  }

  // Write-once: reject if test_condition is already set
  if (intent.test_condition && intent.test_condition.trim()) {
    throw new Error(`Intent '${intent_id}' already has a test condition. Test conditions are write-once. To change the test, supersede the intent.`);
  }

  const result = await pool.query(`
    UPDATE gdd.nodes
    SET test_condition = $1, test_verification = $2
    WHERE id = $3
    RETURNING *
  `, [test_condition.trim(), test_verification ? test_verification.trim() : null, intent_id]);

  return result.rows[0];
}

module.exports = { setTestCondition };
