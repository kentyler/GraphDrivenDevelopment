const { pool } = require('../db');

async function queryCurrentNodes({ pattern }) {
  if (!pattern) throw new Error('pattern is required');

  const result = await pool.query(`
    SELECT n.* FROM gdd.nodes n
    WHERE n.id LIKE $1
      AND NOT EXISTS (
        SELECT 1 FROM gdd.edges e
        WHERE e.to_node = n.id AND e.edge_type = 'supersedes'
      )
    ORDER BY n.id
  `, [pattern]);

  return result.rows;
}

module.exports = { queryCurrentNodes };
