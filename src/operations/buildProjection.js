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
      is_current: !supersededSet.has(n.id),
      has_test: !!(n.test_condition && n.test_condition.trim())
    };
  });

  // Board + edge node context
  const vantageNode = nodeMap[intentId] || traversal.vantage;
  let board = null;
  let edgeNodes = [];

  if (vantageNode.board_id) {
    const boardResult = await pool.query('SELECT * FROM gdd.boards WHERE id = $1', [vantageNode.board_id]);
    if (boardResult.rows.length > 0) {
      board = boardResult.rows[0];

      // Latest tension reading for this board
      const tensionResult = await pool.query(
        'SELECT * FROM gdd.tension_readings WHERE board_id = $1 ORDER BY read_at DESC LIMIT 1',
        [board.id]
      );
      board.latest_tension = tensionResult.rows[0] || null;

      // Active edge nodes on this board, each with latest sensitivity reading
      const edgeResult = await pool.query(
        "SELECT * FROM gdd.edge_nodes WHERE board_id = $1 AND status = 'active' ORDER BY created_at DESC",
        [board.id]
      );
      for (const en of edgeResult.rows) {
        const readingResult = await pool.query(
          'SELECT * FROM gdd.sensitivity_readings WHERE edge_node_id = $1 ORDER BY read_at DESC LIMIT 1',
          [en.id]
        );
        edgeNodes.push({ ...en, latest_reading: readingResult.rows[0] || null });
      }
    }
  }

  return {
    vantage: vantageNode,
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
    nodes: nodeMap,
    board: board,
    edgeNodes: edgeNodes
  };
}

module.exports = { buildProjection };
