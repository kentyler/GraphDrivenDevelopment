const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.GDD_DB_HOST || 'localhost',
  port: process.env.GDD_DB_PORT || 5432,
  database: process.env.GDD_DB_NAME || 'gdd',
  user: process.env.GDD_DB_USER || 'postgres',
  password: process.env.GDD_DB_PASSWORD || '',
});

async function createIntent(node, sessionId) {
  const { id, type, name, description, test, blocked_by, throughput } = node;

  // Validate type
  const validTypes = [
    'define-table', 'define-type', 'define-schema',
    'implement-operation', 'implement-endpoint', 'implement-traversal', 'implement-projection', 'implement-mutation',
    'integrate', 'derive', 'translate',
    'constrain-permission', 'constrain-invariant',
    'establish-convention', 'define-vocabulary', 'compose', 'gap'
  ];

  if (!validTypes.includes(type)) {
    throw new Error(`Invalid intent type: ${type}`);
  }

  // Validate test condition for non-gap and non-compose types
  if (type !== 'gap' && type !== 'compose' && (!test || !test.condition)) {
    throw new Error(`Test condition is required for intent type: ${type}`);
  }

  // Validate notes for gap
  if (type === 'gap' && (!node.notes)) {
    throw new Error('Notes field is required for gap nodes');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Determine initial status
    let status = 'active';
    if (blocked_by && blocked_by.length > 0) {
      status = 'potential';
    }

    const query = `
      INSERT INTO gdd.nodes (id, type, name, description, status, test_condition, test_verification, throughput, session_id, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;
    const values = [
      id, type, name, description, status,
      test?.condition || null,
      test?.verification || null,
      throughput || null,
      sessionId,
      node.created_by || 'system'
    ];

    const res = await client.query(query, values);
    const newNode = res.rows[0];

    // Create blocked-by edges
    if (blocked_by && blocked_by.length > 0) {
      for (const targetId of blocked_by) {
        await client.query(
          'INSERT INTO gdd.edges (from_node, to_node, edge_type) VALUES ($1, $2, $3)',
          [id, targetId, 'blocked-by']
        );
      }
      // Recompute status in case all blockers are already satisfied
      await recomputeStatusInternal(client, id);
    }

    // Record mutation
    await client.query(
      'INSERT INTO gdd.mutations (session_id, action, target_type, target_id, after_state) VALUES ($1, $2, $3, $4, $5)',
      [sessionId, 'node_created', 'node', id, JSON.stringify(newNode)]
    );

    await client.query('COMMIT');
    return newNode;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function createEdge(fromNode, toNode, edgeType, sessionId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const query = `
      INSERT INTO gdd.edges (from_node, to_node, edge_type)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
    const res = await client.query(query, [fromNode, toNode, edgeType]);
    const newEdge = res.rows[0];

    if (edgeType === 'blocked-by') {
      await recomputeStatusInternal(client, fromNode);
    }

    // Record mutation
    await client.query(
      'INSERT INTO gdd.mutations (session_id, action, target_type, target_id, after_state) VALUES ($1, $2, $3, $4, $5)',
      [sessionId, 'edge_created', 'edge', newEdge.id.toString(), JSON.stringify(newEdge)]
    );

    await client.query('COMMIT');
    return newEdge;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function createSession(intentId, actorType, actorId, parentSessionId = null) {
  const id = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const query = `
    INSERT INTO gdd.sessions (id, intent_id, actor_type, actor_id, parent_session_id)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `;
  const res = await pool.query(query, [id, intentId, actorType, actorId, parentSessionId]);
  return res.rows[0];
}

async function recordExpression(intentId, sessionId, artifacts, summary) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get before state
    const beforeRes = await client.query('SELECT * FROM gdd.nodes WHERE id = $1', [intentId]);
    const beforeState = beforeRes.rows[0];

    const query = `
      INSERT INTO gdd.expressions (intent_id, session_id, artifacts, summary)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    const res = await client.query(query, [intentId, sessionId, artifacts, summary]);
    const expression = res.rows[0];

    // Update node status
    await client.query(
        'UPDATE gdd.nodes SET status = $1, expression_artifacts = $2, expression_summary = $3 WHERE id = $4',
        ['satisfied', artifacts, summary, intentId]
    );

    await recomputeStatusInternal(client, intentId);

    // Record mutation
    const afterRes = await client.query('SELECT * FROM gdd.nodes WHERE id = $1', [intentId]);
    const afterState = afterRes.rows[0];

    await client.query(
      'INSERT INTO gdd.mutations (session_id, action, target_type, target_id, before_state, after_state) VALUES ($1, $2, $3, $4, $5, $6)',
      [sessionId, 'expression_recorded', 'node', intentId, JSON.stringify(beforeState), JSON.stringify(afterState)]
    );

    await client.query('COMMIT');
    return expression;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function recomputeStatus(intentId) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await recomputeStatusInternal(client, intentId);
        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}

async function recomputeStatusInternal(client, intentId) {
  const nodeRes = await client.query('SELECT * FROM gdd.nodes WHERE id = $1', [intentId]);
  const node = nodeRes.rows[0];
  if (!node) return;

  let newStatus = node.status;

  if (node.type === 'compose') {
    const childrenRes = await client.query(
      `SELECT status FROM gdd.nodes WHERE id IN (SELECT to_node FROM gdd.edges WHERE from_node = $1 AND edge_type = 'contains')`,
      [intentId]
    );
    const children = childrenRes.rows;
    if (children.length > 0 && children.every(c => c.status === 'satisfied')) {
      newStatus = 'satisfied';
    } else if (node.status === 'satisfied') {
        // If it was satisfied but now isn't
        newStatus = 'active';
    }
  } else {
    // Check expressions
    const exprRes = await client.query('SELECT 1 FROM gdd.expressions WHERE intent_id = $1 LIMIT 1', [intentId]);
    if (exprRes.rows.length > 0) {
      newStatus = 'satisfied';
    } else {
      // Check blockers
      const blockersRes = await client.query(
        `SELECT status FROM gdd.nodes WHERE id IN (SELECT to_node FROM gdd.edges WHERE from_node = $1 AND edge_type = 'blocked-by')`,
        [intentId]
      );
      const blockers = blockersRes.rows;
      if (blockers.every(b => b.status === 'satisfied')) {
        newStatus = 'active';
      } else {
        newStatus = 'potential';
      }
    }
  }

  if (newStatus !== node.status) {
    await client.query('UPDATE gdd.nodes SET status = $1 WHERE id = $2', [newStatus, intentId]);

    // Cascade to downstream dependents
    const dependentsRes = await client.query(
      `SELECT from_node FROM gdd.edges WHERE to_node = $1 AND edge_type IN ('blocked-by', 'contains')`,
      [intentId]
    );
    for (const dep of dependentsRes.rows) {
      await recomputeStatusInternal(client, dep.from_node);
    }
  } else if (newStatus === 'satisfied') {
    // Even if status didn't change (already satisfied), still cascade to ensure
    // downstream nodes are updated if they were waiting for this one.
    // This is important for the initial setup where some nodes might be satisfied
    // but their dependents haven't been updated yet.
    const dependentsRes = await client.query(
      `SELECT from_node FROM gdd.edges WHERE to_node = $1 AND edge_type IN ('blocked-by', 'contains')`,
      [intentId]
    );
    for (const dep of dependentsRes.rows) {
      await recomputeStatusInternal(client, dep.from_node);
    }
  }
}

async function traverseDependencies(intentId) {
    // Returns upstream and downstream nodes
    const upstream = await pool.query(`
        WITH RECURSIVE upstream_nodes AS (
            SELECT n.* FROM gdd.nodes n
            JOIN gdd.edges e ON n.id = e.to_node
            WHERE e.from_node = $1 AND e.edge_type = 'blocked-by'
            UNION
            SELECT n.* FROM gdd.nodes n
            JOIN gdd.edges e ON n.id = e.to_node
            JOIN upstream_nodes un ON e.from_node = un.id
            WHERE e.edge_type = 'blocked-by'
        )
        SELECT * FROM upstream_nodes
    `, [intentId]);

    const downstream = await pool.query(`
        WITH RECURSIVE downstream_nodes AS (
            SELECT n.* FROM gdd.nodes n
            JOIN gdd.edges e ON n.id = e.from_node
            WHERE e.to_node = $1 AND e.edge_type = 'blocked-by'
            UNION
            SELECT n.* FROM gdd.nodes n
            JOIN gdd.edges e ON n.id = e.from_node
            JOIN downstream_nodes dn ON e.to_node = dn.id
            WHERE e.edge_type = 'blocked-by'
        )
        SELECT * FROM downstream_nodes
    `, [intentId]);

    return { upstream: upstream.rows, downstream: downstream.rows };
}

async function queryIncomplete() {
    const query = `
        WITH RECURSIVE downstream_counts AS (
            -- Base case: nodes and their direct dependents
            SELECT to_node as id, from_node as dependent_id
            FROM gdd.edges
            WHERE edge_type = 'blocked-by'
            UNION
            -- Recursive step: transitive dependents
            SELECT dc.id, e.from_node
            FROM downstream_counts dc
            JOIN gdd.edges e ON dc.dependent_id = e.to_node
            WHERE e.edge_type = 'blocked-by'
        ),
        counts AS (
            SELECT n.id, COUNT(DISTINCT dc.dependent_id) as dependent_count
            FROM gdd.nodes n
            LEFT JOIN downstream_counts dc ON n.id = dc.id
            GROUP BY n.id
        )
        SELECT n.*, c.dependent_count
        FROM gdd.nodes n
        JOIN counts c ON n.id = c.id
        WHERE n.status = 'active'
        ORDER BY c.dependent_count DESC, n.created_at ASC
    `;
    const res = await pool.query(query);
    return res.rows;
}

async function buildProjection(intentId) {
    const nodeRes = await pool.query('SELECT * FROM gdd.nodes WHERE id = $1', [intentId]);
    const vantageNode = nodeRes.rows[0];
    if (!vantageNode) return null;

    const deps = await traverseDependencies(intentId);

    // Get session info
    const sessionsRes = await pool.query(`
        SELECT s.* FROM gdd.sessions s
        WHERE s.intent_id = $1 OR s.id IN (
            SELECT session_id FROM gdd.mutations WHERE target_id = $1 AND target_type = 'node'
        )
    `, [intentId]);

    return {
        vantage: vantageNode,
        upstream: deps.upstream,
        downstream: deps.downstream,
        sessions: sessionsRes.rows
    };
}

async function sessionProjection(sessionId) {
    const nodesRes = await pool.query(`
        SELECT DISTINCT n.* FROM gdd.nodes n
        JOIN gdd.mutations m ON n.id = m.target_id
        WHERE m.session_id = $1 AND m.target_type = 'node'
    `, [sessionId]);

    const projection = [];
    for (const node of nodesRes.rows) {
        projection.push(await buildProjection(node.id));
    }
    return projection;
}

async function closeSession(sessionId) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const diff = await sessionDiff(sessionId);

        await client.query(
            'UPDATE gdd.sessions SET status = \'closed\', ended_at = CURRENT_TIMESTAMP WHERE id = $1',
            [sessionId]
        );

        // Record the diff as the session's expression in the global sense
        // Note: The skill file says "Records the diff as the session's expression"
        // In our schema, expressions table is for intents.
        // We'll store it in a way that closeSession returns it.

        await client.query('COMMIT');

        const res = await pool.query('SELECT * FROM gdd.sessions WHERE id = $1', [sessionId]);
        return { ...res.rows[0], diff };
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}

async function sessionDiff(sessionId) {
    const res = await pool.query(
        'SELECT * FROM gdd.mutations WHERE session_id = $1 ORDER BY created_at ASC',
        [sessionId]
    );
    return res.rows;
}

async function defineAgent(agent) {
    const { id, name, scope, trust_level, trigger, created_by, session_id } = agent;
    const query = `
        INSERT INTO gdd.agents (id, name, scope, trust_level, trigger, created_by, session_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
    `;
    const res = await pool.query(query, [id, name, scope, trust_level, trigger || { type: 'manual' }, created_by, session_id]);
    return res.rows[0];
}

async function queryAgents(filters = {}) {
    let query = 'SELECT * FROM gdd.agents';
    const values = [];
    if (filters.status) {
        query += ' WHERE status = $1';
        values.push(filters.status);
    }
    const res = await pool.query(query, values);
    return res.rows;
}

async function activateAgent(agentId) {
    // In a real system, this would trigger an LLM loop.
    // For now, we update the status and record the intent.
    const res = await pool.query(
        'UPDATE gdd.agents SET status = \'active\' WHERE id = $1 RETURNING *',
        [agentId]
    );
    return res.rows[0];
}

async function removeIntent(intentId, sessionId, confirm = false) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Compute cascade
        const cascadeQuery = `
            WITH RECURSIVE cascade_nodes AS (
                SELECT id, name FROM gdd.nodes WHERE id = $1
                UNION
                SELECT n.id, n.name FROM gdd.nodes n
                JOIN gdd.edges e ON n.id = e.from_node
                JOIN cascade_nodes cn ON e.to_node = cn.id
                WHERE e.edge_type = 'blocked-by'
            )
            SELECT * FROM cascade_nodes
        `;
        const cascadeRes = await client.query(cascadeQuery, [intentId]);
        const nodesToRemove = cascadeRes.rows;

        if (!confirm) {
            await client.query('ROLLBACK');
            return { cascade: nodesToRemove };
        }

        for (const node of nodesToRemove) {
            const beforeRes = await client.query('SELECT * FROM gdd.nodes WHERE id = $1', [node.id]);
            const beforeState = beforeRes.rows[0];

            await client.query('DELETE FROM gdd.nodes WHERE id = $1', [node.id]);

            await client.query(
                'INSERT INTO gdd.mutations (session_id, action, target_type, target_id, before_state) VALUES ($1, $2, $3, $4, $5)',
                [sessionId, 'node_removed', 'node', node.id, JSON.stringify(beforeState)]
            );
        }

        await client.query('COMMIT');
        return { removed: nodesToRemove };
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}

module.exports = {
  pool,
  createIntent,
  createEdge,
  createSession,
  recordExpression,
  recomputeStatus,
  traverseDependencies,
  queryIncomplete,
  removeIntent,
  buildProjection,
  sessionProjection,
  closeSession,
  sessionDiff,
  defineAgent,
  queryAgents,
  activateAgent
};
