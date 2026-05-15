const { pool } = require('../db');

async function createEdgeNode({ id, name, content, board_id, related_nodes, weight, created_by }) {
  if (!name) throw new Error('name is required');
  if (!board_id) throw new Error('board_id is required');

  const nodeId = id || `edge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const result = await pool.query(`
    INSERT INTO gdd.edge_nodes (id, board_id, created_by, name, content, related_nodes, weight)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
  `, [nodeId, board_id, created_by || null, name, content || null, related_nodes || null, weight || null]);

  return result.rows[0];
}

async function getEdgeNode(id) {
  if (!id) throw new Error('id is required');

  const node = await pool.query('SELECT * FROM gdd.edge_nodes WHERE id = $1', [id]);
  if (node.rows.length === 0) throw Object.assign(new Error('Edge node not found'), { status: 404 });

  const readings = await pool.query(
    'SELECT * FROM gdd.sensitivity_readings WHERE edge_node_id = $1 ORDER BY read_at DESC',
    [id]
  );

  const expansions = await pool.query(
    'SELECT * FROM gdd.expansion_events WHERE edge_node_id = $1 ORDER BY occurred_at DESC',
    [id]
  );

  const conversions = await pool.query(
    'SELECT * FROM gdd.conversion_events WHERE edge_node_id = $1 ORDER BY occurred_at DESC',
    [id]
  );

  return {
    ...node.rows[0],
    sensitivity_readings: readings.rows,
    expansion_events: expansions.rows,
    conversion_events: conversions.rows
  };
}

async function queryEdgeNodes({ board_id = null, status = null } = {}) {
  let query = 'SELECT en.* FROM gdd.edge_nodes en WHERE 1=1';
  const params = [];
  let idx = 1;

  if (board_id) {
    query += ` AND en.board_id = $${idx++}`;
    params.push(board_id);
  }
  if (status) {
    query += ` AND en.status = $${idx++}`;
    params.push(status);
  }

  query += ' ORDER BY en.created_at DESC';
  const nodes = await pool.query(query, params);

  // For each edge node, get latest sensitivity reading
  const results = [];
  for (const node of nodes.rows) {
    const reading = await pool.query(`
      SELECT * FROM gdd.sensitivity_readings
      WHERE edge_node_id = $1
      ORDER BY read_at DESC LIMIT 1
    `, [node.id]);

    results.push({
      ...node,
      latest_reading: reading.rows[0] || null
    });
  }

  return results;
}

async function recordSensitivityReading({ edge_node_id, signal, read_by, board_impact }) {
  if (!edge_node_id || !signal) throw new Error('edge_node_id and signal are required');

  const result = await pool.query(`
    INSERT INTO gdd.sensitivity_readings (edge_node_id, read_by, signal, board_impact)
    VALUES ($1, $2, $3, $4)
    RETURNING *
  `, [edge_node_id, read_by || null, signal, board_impact || null]);

  return result.rows[0];
}

async function convertGapToEdge({ gap_id, board_id, content, description, failed_articulation_attempts, created_by }) {
  if (!gap_id) throw new Error('gap_id is required');
  if (!board_id) throw new Error('board_id is required');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Verify gap exists
    const gap = await client.query('SELECT * FROM gdd.nodes WHERE id = $1 AND type = $2', [gap_id, 'gap']);
    if (gap.rows.length === 0) throw new Error(`Gap node '${gap_id}' not found`);

    // 2. Create decision node closing the gap (records conversion rationale)
    const decisionId = `decision-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const decisionNotes = description || `Converted gap '${gap_id}' to edge node — this boundary should not be resolved`;
    await client.query(`
      INSERT INTO gdd.nodes (id, type, name, notes, board_id)
      VALUES ($1, 'decision', $2, $3, $4)
    `, [decisionId, `Convert ${gap.rows[0].name} to edge`, decisionNotes, board_id]);

    // Create closes edge from decision to gap
    await client.query(`
      INSERT INTO gdd.edges (from_node, to_node, edge_type)
      VALUES ($1, $2, 'closes')
    `, [decisionId, gap_id]);

    // 3. Create edge node with source_gap_id
    const edgeId = `edge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const edgeNode = await client.query(`
      INSERT INTO gdd.edge_nodes (id, board_id, created_by, name, content, source_gap_id, status)
      VALUES ($1, $2, $3, $4, $5, $6, 'converted')
      RETURNING *
    `, [edgeId, board_id, created_by || null, gap.rows[0].name, content || gap.rows[0].notes, gap_id]);

    // 4. Create conversion event
    await client.query(`
      INSERT INTO gdd.conversion_events (edge_node_id, description, original_gap_node_id, failed_articulation_attempts)
      VALUES ($1, $2, $3, $4)
    `, [edgeId, decisionNotes, gap_id, failed_articulation_attempts || null]);

    await client.query('COMMIT');

    // Fetch the decision for return
    const decision = await client.query('SELECT * FROM gdd.nodes WHERE id = $1', [decisionId]);

    return {
      edge_node: edgeNode.rows[0],
      decision: decision.rows[0]
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function expandEdgeNode({ edge_node_id, description, gap_name, gap_notes, created_by }) {
  if (!edge_node_id) throw new Error('edge_node_id is required');
  if (!gap_name) throw new Error('gap_name is required');
  if (!gap_notes) throw new Error('gap_notes is required');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Verify edge node is active
    const edgeNode = await client.query('SELECT * FROM gdd.edge_nodes WHERE id = $1', [edge_node_id]);
    if (edgeNode.rows.length === 0) throw new Error(`Edge node '${edge_node_id}' not found`);
    if (edgeNode.rows[0].status !== 'active') {
      throw new Error(`Edge node '${edge_node_id}' is '${edgeNode.rows[0].status}', must be 'active' to expand`);
    }

    // 2. Update edge node status to expanded
    await client.query(`
      UPDATE gdd.edge_nodes SET status = 'expanded' WHERE id = $1
    `, [edge_node_id]);

    // 3. Create gap node in gdd.nodes (with board_id from edge node)
    const gapId = `gap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const gapNode = await client.query(`
      INSERT INTO gdd.nodes (id, type, name, notes, board_id)
      VALUES ($1, 'gap', $2, $3, $4)
      RETURNING *
    `, [gapId, gap_name, gap_notes, edgeNode.rows[0].board_id]);

    // 4. Create expansion event
    await client.query(`
      INSERT INTO gdd.expansion_events (edge_node_id, description, new_gap_node_id)
      VALUES ($1, $2, $3)
    `, [edge_node_id, description || `Expanded edge '${edgeNode.rows[0].name}' into gap`, gapId]);

    await client.query('COMMIT');

    // Fetch updated edge node
    const updated = await client.query('SELECT * FROM gdd.edge_nodes WHERE id = $1', [edge_node_id]);

    return {
      edge_node: updated.rows[0],
      gap: gapNode.rows[0]
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { createEdgeNode, getEdgeNode, queryEdgeNodes, recordSensitivityReading, convertGapToEdge, expandEdgeNode };
