const { pool } = require('../db');

async function querySkills({ category = null } = {}) {
  let query = 'SELECT * FROM gdd.skills';
  const params = [];

  if (category) {
    query += ' WHERE category = $1';
    params.push(category);
  }

  query += ' ORDER BY name';
  const result = await pool.query(query, params);
  return result.rows;
}

module.exports = { querySkills };
