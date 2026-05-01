const { pool } = require('../db');

async function createGraph({ id, name, owner }) {
  if (!id || !name) throw new Error('id and name are required');

  const result = await pool.query(`
    INSERT INTO gdd.graphs (id, name, owner)
    VALUES ($1, $2, $3)
    RETURNING *
  `, [id, name, owner || null]);

  return result.rows[0];
}

async function addNodeToGraph({ graph_id, node_id }) {
  if (!graph_id || !node_id) throw new Error('graph_id and node_id are required');

  const result = await pool.query(`
    INSERT INTO gdd.graph_memberships (graph_id, node_id)
    VALUES ($1, $2)
    RETURNING *
  `, [graph_id, node_id]);

  return result.rows[0];
}

async function removeNodeFromGraph({ graph_id, node_id }) {
  if (!graph_id || !node_id) throw new Error('graph_id and node_id are required');

  const result = await pool.query(`
    DELETE FROM gdd.graph_memberships
    WHERE graph_id = $1 AND node_id = $2
    RETURNING *
  `, [graph_id, node_id]);

  if (result.rows.length === 0) {
    throw new Error(`Membership (${graph_id}, ${node_id}) does not exist`);
  }
  return result.rows[0];
}

async function queryGraphNodes({ graph_id, type = null }) {
  if (!graph_id) throw new Error('graph_id is required');

  let query = `
    SELECT n.* FROM gdd.nodes n
    JOIN gdd.graph_memberships gm ON gm.node_id = n.id
    WHERE gm.graph_id = $1
  `;
  const params = [graph_id];

  if (type) {
    query += ' AND n.type = $2';
    params.push(type);
  }

  query += ' ORDER BY n.id';
  const result = await pool.query(query, params);
  return result.rows;
}

async function nodeGraphs(node_id) {
  if (!node_id) throw new Error('node_id is required');

  const result = await pool.query(`
    SELECT g.* FROM gdd.graphs g
    JOIN gdd.graph_memberships gm ON gm.graph_id = g.id
    WHERE gm.node_id = $1
    ORDER BY g.id
  `, [node_id]);

  return result.rows;
}

module.exports = { createGraph, addNodeToGraph, removeNodeFromGraph, queryGraphNodes, nodeGraphs };
