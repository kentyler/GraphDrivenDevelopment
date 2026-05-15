const { pool } = require('../db');

async function queryIncomplete({ workable = false, graph_id = null, board_id = null } = {}) {
  let query;
  const params = [];
  let idx = 1;

  // Build filter clauses
  let graphFilter = '';
  if (graph_id) {
    graphFilter = `AND EXISTS (SELECT 1 FROM gdd.graph_memberships gm WHERE gm.node_id = n.id AND gm.graph_id = $${idx})`;
    params.push(graph_id);
    idx++;
  }

  let boardFilter = '';
  if (board_id) {
    boardFilter = `AND n.board_id = $${idx}`;
    params.push(board_id);
    idx++;
  }

  if (workable) {
    // Return only red intents whose blocked-by dependencies are all green
    query = `
      SELECT n.*,
        (SELECT COUNT(*) FROM (
          WITH RECURSIVE downstream AS (
            SELECT e.from_node AS id
            FROM gdd.edges e
            WHERE e.to_node = n.id AND e.edge_type = 'blocked-by'
            UNION
            SELECT e.from_node
            FROM gdd.edges e
            JOIN downstream d ON e.to_node = d.id
            WHERE e.edge_type = 'blocked-by'
          )
          SELECT id FROM downstream
        ) sub) AS downstream_count
      FROM gdd.nodes n
      WHERE n.type NOT IN ('compose', 'expression', 'decision', 'signal')
        AND NOT EXISTS (SELECT 1 FROM gdd.edges e WHERE e.to_node = n.id AND e.edge_type = 'satisfies')
        AND NOT EXISTS (SELECT 1 FROM gdd.edges e WHERE e.to_node = n.id AND e.edge_type = 'supersedes')
        AND NOT EXISTS (
          SELECT 1 FROM gdd.edges dep
          WHERE dep.from_node = n.id AND dep.edge_type = 'blocked-by'
          AND NOT EXISTS (
            SELECT 1 FROM gdd.edges sat
            WHERE sat.to_node = dep.to_node AND sat.edge_type = 'satisfies'
          )
          AND (SELECT type FROM gdd.nodes WHERE id = dep.to_node) != 'compose'
        )
        AND NOT EXISTS (
          SELECT 1 FROM gdd.edges dep
          WHERE dep.from_node = n.id AND dep.edge_type = 'blocked-by'
          AND (SELECT type FROM gdd.nodes WHERE id = dep.to_node) = 'compose'
          AND EXISTS (
            SELECT 1 FROM gdd.edges child_edge
            JOIN gdd.nodes child ON child.id = child_edge.to_node
            WHERE child_edge.from_node = dep.to_node AND child_edge.edge_type = 'contains'
            AND NOT EXISTS (
              SELECT 1 FROM gdd.edges sat WHERE sat.to_node = child.id AND sat.edge_type = 'satisfies'
            )
          )
        )
      ${graphFilter}
      ${boardFilter}
      ORDER BY downstream_count DESC, n.id
    `;
  } else {
    // Return all red, current intents and gaps
    query = `
      SELECT n.*,
        (SELECT COUNT(*) FROM (
          WITH RECURSIVE downstream AS (
            SELECT e.from_node AS id
            FROM gdd.edges e
            WHERE e.to_node = n.id AND e.edge_type = 'blocked-by'
            UNION
            SELECT e.from_node
            FROM gdd.edges e
            JOIN downstream d ON e.to_node = d.id
            WHERE e.edge_type = 'blocked-by'
          )
          SELECT id FROM downstream
        ) sub) AS downstream_count
      FROM gdd.nodes n
      WHERE n.type NOT IN ('compose', 'expression', 'decision', 'signal')
        AND NOT EXISTS (SELECT 1 FROM gdd.edges e WHERE e.to_node = n.id AND e.edge_type = 'satisfies')
        AND NOT EXISTS (SELECT 1 FROM gdd.edges e WHERE e.to_node = n.id AND e.edge_type = 'supersedes')
      ${graphFilter}
      ${boardFilter}
      ORDER BY downstream_count DESC, n.id
    `;
  }

  const result = await pool.query(query, params);
  return result.rows;
}

module.exports = { queryIncomplete };
