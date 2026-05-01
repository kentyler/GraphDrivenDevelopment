const { pool } = require('../db');

async function defineAgent({ id, name, scope, trust_level = 'gaps-only', trigger = { type: 'manual' } }) {
  if (!id || !name) throw new Error('id and name are required');
  if (!scope) throw new Error('scope is required');

  const validTrust = ['full', 'express-only', 'gaps-only'];
  if (!validTrust.includes(trust_level)) {
    throw new Error(`trust_level must be one of: ${validTrust.join(', ')}`);
  }

  const result = await pool.query(`
    INSERT INTO gdd.agents (id, name, scope, trust_level, trigger, status)
    VALUES ($1, $2, $3, $4, $5, 'defined')
    RETURNING *
  `, [id, name, JSON.stringify(scope), trust_level, JSON.stringify(trigger)]);

  return result.rows[0];
}

module.exports = { defineAgent };
