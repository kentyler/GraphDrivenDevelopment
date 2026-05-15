const { pool } = require('../db');

// Find expressions that have no satisfies edges -- produced artifacts
// not yet claimed to satisfy any intent. Optionally scoped by board.
async function queryUnlinked({ board_id = null } = {}) {
  let query = `
    SELECT n.* FROM gdd.nodes n
    WHERE n.type = 'expression'
      AND NOT EXISTS (SELECT 1 FROM gdd.edges e WHERE e.from_node = n.id AND e.edge_type = 'satisfies')
      AND n.id NOT IN (SELECT to_node FROM gdd.edges WHERE edge_type = 'supersedes')
  `;
  const params = [];

  if (board_id) {
    params.push(board_id);
    query += ` AND n.board_id = $${params.length}`;
  }

  query += ' ORDER BY n.id DESC';

  const result = await pool.query(query, params);
  return result.rows;
}

module.exports = { queryUnlinked };
