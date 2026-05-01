const { pool } = require('../db');

async function traverseDependencies(intentId) {
  if (!intentId) throw new Error('intentId is required');

  // Verify node exists
  const node = await pool.query('SELECT * FROM gdd.nodes WHERE id = $1', [intentId]);
  if (node.rows.length === 0) throw new Error(`Node '${intentId}' does not exist`);

  // Traverse upstream (what blocks me — follow blocked-by edges forward)
  const upstream = await pool.query(`
    WITH RECURSIVE upstream AS (
      SELECT e.to_node AS id, 1 AS depth
      FROM gdd.edges e
      WHERE e.from_node = $1 AND e.edge_type = 'blocked-by'
      UNION
      SELECT e.to_node, u.depth + 1
      FROM gdd.edges e
      JOIN upstream u ON e.from_node = u.id
      WHERE e.edge_type = 'blocked-by' AND u.depth < 20
    )
    SELECT DISTINCT n.*, u.depth,
      EXISTS(SELECT 1 FROM gdd.edges e WHERE e.to_node = n.id AND e.edge_type = 'satisfies') AS is_green
    FROM upstream u
    JOIN gdd.nodes n ON n.id = u.id
    ORDER BY u.depth
  `, [intentId]);

  // Traverse downstream (what I unblock — follow blocked-by edges in reverse)
  const downstream = await pool.query(`
    WITH RECURSIVE downstream AS (
      SELECT e.from_node AS id, 1 AS depth
      FROM gdd.edges e
      WHERE e.to_node = $1 AND e.edge_type = 'blocked-by'
      UNION
      SELECT e.from_node, d.depth + 1
      FROM gdd.edges e
      JOIN downstream d ON e.to_node = d.id
      WHERE e.edge_type = 'blocked-by' AND d.depth < 20
    )
    SELECT DISTINCT n.*, d.depth,
      EXISTS(SELECT 1 FROM gdd.edges e WHERE e.to_node = n.id AND e.edge_type = 'satisfies') AS is_green
    FROM downstream d
    JOIN gdd.nodes n ON n.id = d.id
    ORDER BY d.depth
  `, [intentId]);

  return {
    vantage: node.rows[0],
    upstream: upstream.rows,
    downstream: downstream.rows
  };
}

module.exports = { traverseDependencies };
