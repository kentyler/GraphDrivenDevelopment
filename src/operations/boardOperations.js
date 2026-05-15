const { pool } = require('../db');

async function createBoard({ id, name, statement, edge_statement, created_by }) {
  if (!id || !name) throw new Error('id and name are required');

  const result = await pool.query(`
    INSERT INTO gdd.boards (id, created_by, statement, edge_statement)
    VALUES ($1, $2, $3, $4)
    RETURNING *
  `, [id, created_by || null, statement || null, edge_statement || null]);

  return result.rows[0];
}

async function getBoard(board_id) {
  if (!board_id) throw new Error('board_id is required');

  const board = await pool.query('SELECT * FROM gdd.boards WHERE id = $1', [board_id]);
  if (board.rows.length === 0) throw Object.assign(new Error('Board not found'), { status: 404 });

  // Latest tension reading
  const tension = await pool.query(`
    SELECT * FROM gdd.tension_readings
    WHERE board_id = $1
    ORDER BY read_at DESC LIMIT 1
  `, [board_id]);

  // Edge node count
  const edgeCount = await pool.query(`
    SELECT COUNT(*) FROM gdd.edge_nodes WHERE board_id = $1 AND status = 'active'
  `, [board_id]);

  return {
    ...board.rows[0],
    latest_tension: tension.rows[0] || null,
    active_edge_node_count: parseInt(edgeCount.rows[0].count)
  };
}

async function queryBoards({ status = null } = {}) {
  let query = 'SELECT b.* FROM gdd.boards b';
  const params = [];

  if (status) {
    query += ' WHERE b.status = $1';
    params.push(status);
  }

  query += ' ORDER BY b.created_at DESC';
  const boards = await pool.query(query, params);

  // For each board, get latest tension reading
  const results = [];
  for (const board of boards.rows) {
    const tension = await pool.query(`
      SELECT * FROM gdd.tension_readings
      WHERE board_id = $1
      ORDER BY read_at DESC LIMIT 1
    `, [board.id]);

    results.push({
      ...board,
      latest_tension: tension.rows[0] || null
    });
  }

  return results;
}

async function updateBoardStatement({ board_id, statement, edge_statement }) {
  if (!board_id) throw new Error('board_id is required');
  if (!statement && !edge_statement) throw new Error('At least one of statement or edge_statement is required');

  const fields = [];
  const params = [];
  let idx = 1;

  if (statement !== undefined) {
    fields.push(`statement = $${idx++}`);
    params.push(statement);
  }
  if (edge_statement !== undefined) {
    fields.push(`edge_statement = $${idx++}`);
    params.push(edge_statement);
  }

  params.push(board_id);
  const result = await pool.query(`
    UPDATE gdd.boards SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *
  `, params);

  if (result.rows.length === 0) throw Object.assign(new Error('Board not found'), { status: 404 });
  return result.rows[0];
}

async function recordTensionReading({ board_id, signal, read_by, edge_node_id, tension_character }) {
  if (!board_id || !signal) throw new Error('board_id and signal are required');

  const result = await pool.query(`
    INSERT INTO gdd.tension_readings (board_id, read_by, signal, edge_node_id, tension_character)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `, [board_id, read_by || null, signal, edge_node_id || null, tension_character || null]);

  return result.rows[0];
}

async function assignNodeToBoard({ node_id, board_id }) {
  if (!node_id || !board_id) throw new Error('node_id and board_id are required');

  // Verify board exists
  const board = await pool.query('SELECT id FROM gdd.boards WHERE id = $1', [board_id]);
  if (board.rows.length === 0) throw Object.assign(new Error('Board not found'), { status: 404 });

  const result = await pool.query(`
    UPDATE gdd.nodes SET board_id = $1 WHERE id = $2 RETURNING *
  `, [board_id, node_id]);

  if (result.rows.length === 0) throw Object.assign(new Error('Node not found'), { status: 404 });
  return result.rows[0];
}

async function queryBoardNodes({ board_id, type = null }) {
  if (!board_id) throw new Error('board_id is required');

  let query = 'SELECT * FROM gdd.nodes WHERE board_id = $1';
  const params = [board_id];

  if (type) {
    query += ' AND type = $2';
    params.push(type);
  }

  query += ' ORDER BY id';
  const result = await pool.query(query, params);
  return result.rows;
}

module.exports = { createBoard, getBoard, queryBoards, updateBoardStatement, recordTensionReading, assignNodeToBoard, queryBoardNodes };
