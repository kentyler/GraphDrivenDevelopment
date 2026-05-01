const { pool } = require('../db');

async function queryAgents({ status = null, intent_id = null } = {}) {
  let query = 'SELECT * FROM gdd.agents WHERE 1=1';
  const params = [];
  let paramIdx = 1;

  if (status) {
    query += ` AND status = $${paramIdx}`;
    params.push(status);
    paramIdx++;
  }

  if (intent_id) {
    query += ` AND scope::text LIKE $${paramIdx}`;
    params.push(`%${intent_id}%`);
    paramIdx++;
  }

  query += ' ORDER BY name';
  const result = await pool.query(query, params);

  // Add gap counts for each agent
  const agents = [];
  for (const agent of result.rows) {
    const scope = typeof agent.scope === 'string' ? JSON.parse(agent.scope) : agent.scope;
    const scopeIds = scope?.intent_ids || [];

    let gapCount = 0;
    if (scopeIds.length > 0) {
      const gaps = await pool.query(`
        SELECT COUNT(*) FROM gdd.nodes
        WHERE type = 'gap'
        AND id = ANY($1)
        AND NOT EXISTS (SELECT 1 FROM gdd.edges WHERE to_node = gdd.nodes.id AND edge_type = 'satisfies')
      `, [scopeIds]);
      gapCount = parseInt(gaps.rows[0].count);
    }

    agents.push({ ...agent, gap_count: gapCount });
  }

  return agents;
}

module.exports = { queryAgents };
