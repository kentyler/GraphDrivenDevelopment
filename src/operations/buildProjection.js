const { pool } = require('../db');
const { traverseDependencies } = require('./traverseDependencies');

async function buildProjection(intentId, { graph_id = null } = {}) {
  if (!intentId) throw new Error('intentId is required');

  // Get the traversal (upstream + downstream)
  const traversal = await traverseDependencies(intentId);

  // Gather all node IDs in the neighborhood
  const allNodeIds = [
    intentId,
    ...traversal.upstream.map(n => n.id),
    ...traversal.downstream.map(n => n.id)
  ];

  // If graph_id is specified, filter to only nodes in that graph
  let filteredIds = allNodeIds;
  if (graph_id) {
    const memberships = await pool.query(
      'SELECT node_id FROM gdd.graph_memberships WHERE graph_id = $1 AND node_id = ANY($2)',
      [graph_id, allNodeIds]
    );
    filteredIds = memberships.rows.map(r => r.node_id);
    if (!filteredIds.includes(intentId)) filteredIds.push(intentId); // always include vantage
  }

  // Get all edges involving these nodes
  const edges = await pool.query(`
    SELECT * FROM gdd.edges
    WHERE from_node = ANY($1) OR to_node = ANY($1)
  `, [filteredIds]);

  // Find gaps in neighborhood (connected by any edge)
  const neighborIds = new Set(filteredIds);
  edges.rows.forEach(e => { neighborIds.add(e.from_node); neighborIds.add(e.to_node); });

  const gaps = await pool.query(`
    SELECT * FROM gdd.nodes
    WHERE id = ANY($1) AND type = 'gap'
  `, [Array.from(neighborIds)]);

  // Find decisions that close those gaps
  const gapIds = gaps.rows.map(g => g.id);
  let decisions = { rows: [] };
  if (gapIds.length > 0) {
    decisions = await pool.query(`
      SELECT DISTINCT n.* FROM gdd.nodes n
      JOIN gdd.edges e ON e.from_node = n.id
      WHERE e.edge_type = 'closes' AND e.to_node = ANY($1)
    `, [gapIds]);
  }

  // Find expression nodes linked via satisfies edges to nodes in this subgraph
  // Exclude superseded expressions — only return open (unsuperseded) ones
  const expressions = await pool.query(`
    SELECT DISTINCT n.* FROM gdd.nodes n
    JOIN gdd.edges e ON e.from_node = n.id
    WHERE e.edge_type = 'satisfies' AND e.to_node = ANY($1)
      AND n.id NOT IN (
        SELECT to_node FROM gdd.edges WHERE edge_type = 'supersedes'
      )
  `, [filteredIds]);

  // Compute red/green for each node
  const greenCheck = await pool.query(`
    SELECT DISTINCT to_node FROM gdd.edges
    WHERE edge_type = 'satisfies' AND to_node = ANY($1)
  `, [filteredIds]);
  const greenSet = new Set(greenCheck.rows.map(r => r.to_node));

  // Supersession check
  const superseded = await pool.query(`
    SELECT DISTINCT to_node FROM gdd.edges
    WHERE edge_type = 'supersedes' AND to_node = ANY($1)
  `, [filteredIds]);
  const supersededSet = new Set(superseded.rows.map(r => r.to_node));

  // Build the projection object
  const nodesInProjection = await pool.query('SELECT * FROM gdd.nodes WHERE id = ANY($1)', [filteredIds]);
  const nodeMap = {};
  nodesInProjection.rows.forEach(n => {
    nodeMap[n.id] = {
      ...n,
      is_green: greenSet.has(n.id),
      is_superseded: supersededSet.has(n.id),
      is_current: !supersededSet.has(n.id)
    };
  });

  return {
    vantage: nodeMap[intentId] || traversal.vantage,
    upstream: traversal.upstream.filter(n => filteredIds.includes(n.id)).map(n => ({
      ...n, is_green: greenSet.has(n.id), is_superseded: supersededSet.has(n.id)
    })),
    downstream: traversal.downstream.filter(n => filteredIds.includes(n.id)).map(n => ({
      ...n, is_green: greenSet.has(n.id), is_superseded: supersededSet.has(n.id)
    })),
    edges: edges.rows,
    gaps: gaps.rows,
    decisions: decisions.rows,
    expressions: expressions.rows,
    nodes: nodeMap
  };
}

module.exports = { buildProjection };
