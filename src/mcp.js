const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { z } = require('zod');

const { createIntent } = require('./operations/createIntent');
const { createEdge } = require('./operations/createEdge');
const { recordExpression } = require('./operations/recordExpression');
const { linkExpression } = require('./operations/linkExpression');
const { createGap } = require('./operations/createGap');
const { createDecision } = require('./operations/createDecision');
const { supersedeIntent } = require('./operations/supersedeIntent');
const { supersedeEdge } = require('./operations/supersedeEdge');
const { queryIncomplete } = require('./operations/queryIncomplete');
const { querySkills } = require('./operations/querySkills');
const { buildProjection } = require('./operations/buildProjection');
const { clientSession } = require('./operations/clientSession');
const { queryAgents } = require('./operations/queryAgents');
const { createGraph, addNodeToGraph, removeNodeFromGraph, queryGraphNodes, nodeGraphs } = require('./operations/graphOperations');
const { createBoard, getBoard, queryBoards, recordTensionReading, assignNodeToBoard } = require('./operations/boardOperations');
const { queryUnlinked } = require('./operations/queryUnlinked');
const { setTestCondition } = require('./operations/setTestCondition');
const { createEdgeNode, getEdgeNode, queryEdgeNodes, recordSensitivityReading, convertGapToEdge, expandEdgeNode } = require('./operations/edgeNodeOperations');
const { pool } = require('./db');
const fs = require('fs');
const path = require('path');

const WORKING_INTENT_FILE = path.join(process.env.HOME || process.env.USERPROFILE, '.claude', 'hooks', 'gdd-working-intent.json');

function createMcpServer() {
  const server = new McpServer({ name: 'gdd', version: '1.0.0' });

  server.tool('query_incomplete', { workable: z.boolean().optional(), graph_id: z.string().optional() }, async (params) => {
    const result = await queryIncomplete({ workable: params.workable, graph_id: params.graph_id });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  });

  server.tool('build_projection', { intent_id: z.string(), graph_id: z.string().optional() }, async (params) => {
    const result = await buildProjection(params.intent_id, { graph_id: params.graph_id });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  });

  server.tool('create_intent', {
    id: z.string(), type: z.string(), name: z.string(),
    description: z.string().optional(), test_condition: z.string().optional(),
    test_verification: z.string().optional(), blocked_by: z.string().optional()
  }, async (params) => {
    const blocked_by = params.blocked_by ? params.blocked_by.split(',').map(s => s.trim()) : undefined;
    const result = await createIntent({ ...params, blocked_by });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  });

  server.tool('record_expression', {
    intent_ids: z.string().optional(), name: z.string(),
    description: z.string().optional(), artifacts: z.string()
  }, async (params) => {
    const intent_ids = params.intent_ids ? params.intent_ids.split(',').map(s => s.trim()) : [];
    const artifacts = JSON.parse(params.artifacts);
    const result = await recordExpression({ intent_ids, name: params.name, description: params.description, artifacts });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  });

  server.tool('link_expression', { expression_id: z.string(), intent_id: z.string() }, async (params) => {
    const result = await linkExpression(params);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  });

  server.tool('set_test_condition', {
    intent_id: z.string(), test_condition: z.string(), test_verification: z.string().optional()
  }, async (params) => {
    const result = await setTestCondition(params);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  });

  server.tool('query_unlinked', { board_id: z.string().optional() }, async (params) => {
    const result = await queryUnlinked({ board_id: params.board_id });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  });

  server.tool('create_gap', { name: z.string(), notes: z.string(), id: z.string().optional() }, async (params) => {
    const result = await createGap(params);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  });

  server.tool('create_decision', {
    name: z.string(), description: z.string().optional(), notes: z.string(),
    closes: z.string().optional(), id: z.string().optional()
  }, async (params) => {
    const closes = params.closes ? params.closes.split(',').map(s => s.trim()) : undefined;
    const result = await createDecision({ ...params, closes });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  });

  server.tool('supersede_intent', { new_intent_id: z.string(), old_intent_id: z.string() }, async (params) => {
    const result = await supersedeIntent(params);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  });

  server.tool('create_edge', {
    from_node: z.string(), to_node: z.string(), edge_type: z.string(),
    description: z.string().optional(), created_by: z.string().optional()
  }, async (params) => {
    const result = await createEdge(params);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  });

  server.tool('supersede_edge', {
    old_edge_id: z.string(), from_node: z.string().optional(), to_node: z.string().optional(),
    edge_type: z.string().optional(), description: z.string().optional(), created_by: z.string().optional()
  }, async (params) => {
    const result = await supersedeEdge(params);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  });

  server.tool('query_skills', { category: z.string().optional() }, async (params) => {
    const result = await querySkills(params);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  });

  server.tool('query_agents', { status: z.string().optional(), intent_id: z.string().optional() }, async (params) => {
    const result = await queryAgents(params);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  });

  server.tool('ask', { input: z.string(), client_id: z.string().optional(), context_intent_id: z.string().optional() }, async (params) => {
    const result = await clientSession(params.input, { client_id: params.client_id, context_intent_id: params.context_intent_id });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  });

  server.tool('configure_provider', {
    action: z.string(), name: z.string().optional(), provider: z.string().optional(),
    api_key: z.string().optional(), model: z.string().optional(), id: z.string().optional()
  }, async (params) => {
    if (params.action === 'list') {
      const result = await pool.query('SELECT id, name, provider, model, is_active FROM gdd.llm_providers ORDER BY name');
      return { content: [{ type: 'text', text: JSON.stringify(result.rows, null, 2) }] };
    } else if (params.action === 'add') {
      const result = await pool.query(
        'INSERT INTO gdd.llm_providers (name, provider, api_key, model) VALUES ($1, $2, $3, $4) RETURNING id, name, provider, model, is_active',
        [params.name, params.provider, params.api_key, params.model]
      );
      return { content: [{ type: 'text', text: JSON.stringify(result.rows[0], null, 2) }] };
    } else if (params.action === 'activate') {
      await pool.query('UPDATE gdd.llm_providers SET is_active = FALSE');
      const result = await pool.query('UPDATE gdd.llm_providers SET is_active = TRUE WHERE id = $1 RETURNING *', [params.id]);
      return { content: [{ type: 'text', text: JSON.stringify(result.rows[0], null, 2) }] };
    }
    return { content: [{ type: 'text', text: 'Unknown action. Use: list, add, activate' }] };
  });

  server.tool('create_graph', { id: z.string(), name: z.string(), owner: z.string().optional() }, async (params) => {
    const result = await createGraph(params);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  });

  server.tool('add_node_to_graph', { graph_id: z.string(), node_id: z.string() }, async (params) => {
    const result = await addNodeToGraph(params);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  });

  server.tool('remove_node_from_graph', { graph_id: z.string(), node_id: z.string() }, async (params) => {
    const result = await removeNodeFromGraph(params);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  });

  server.tool('query_graph_nodes', { graph_id: z.string(), type: z.string().optional() }, async (params) => {
    const result = await queryGraphNodes(params);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  });

  server.tool('node_graphs', { node_id: z.string() }, async (params) => {
    const result = await nodeGraphs(params.node_id);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  });

  // --- Board tools ---
  server.tool('create_board', {
    id: z.string(), name: z.string(),
    statement: z.string().optional(), edge_statement: z.string().optional(),
    created_by: z.string().optional()
  }, async (params) => {
    const result = await createBoard(params);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  });

  server.tool('query_boards', { status: z.string().optional() }, async (params) => {
    const result = await queryBoards(params);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  });

  server.tool('get_board', { board_id: z.string() }, async (params) => {
    const result = await getBoard(params.board_id);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  });

  server.tool('record_tension_reading', {
    board_id: z.string(), signal: z.string(),
    read_by: z.string().optional(), edge_node_id: z.string().optional(),
    tension_character: z.string().optional()
  }, async (params) => {
    const result = await recordTensionReading(params);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  });

  server.tool('assign_node_to_board', { node_id: z.string(), board_id: z.string() }, async (params) => {
    const result = await assignNodeToBoard(params);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  });

  // --- Axiom tools ---
  server.tool('query_board_axioms', { board_id: z.string() }, async (params) => {
    const result = await pool.query(`
      SELECT * FROM gdd.nodes
      WHERE type = 'axiom' AND board_id = $1
        AND id NOT IN (SELECT to_node FROM gdd.edges WHERE edge_type = 'supersedes')
      ORDER BY created_at
    `, [params.board_id]);
    return { content: [{ type: 'text', text: JSON.stringify(result.rows, null, 2) }] };
  });

  // --- Edge node tools ---
  server.tool('create_edge_node', {
    name: z.string(), board_id: z.string(),
    id: z.string().optional(), content: z.string().optional(),
    related_nodes: z.string().optional(), weight: z.number().optional(),
    created_by: z.string().optional()
  }, async (params) => {
    const related_nodes = params.related_nodes ? params.related_nodes.split(',').map(s => s.trim()) : undefined;
    const result = await createEdgeNode({ ...params, related_nodes });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  });

  server.tool('query_edge_nodes', { board_id: z.string().optional(), status: z.string().optional() }, async (params) => {
    const result = await queryEdgeNodes(params);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  });

  server.tool('get_edge_node', { id: z.string() }, async (params) => {
    const result = await getEdgeNode(params.id);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  });

  server.tool('record_sensitivity_reading', {
    edge_node_id: z.string(), signal: z.string(),
    read_by: z.string().optional(), board_impact: z.string().optional()
  }, async (params) => {
    const result = await recordSensitivityReading(params);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  });

  server.tool('convert_gap_to_edge', {
    gap_id: z.string(), board_id: z.string(),
    content: z.string().optional(), description: z.string().optional(),
    failed_articulation_attempts: z.string().optional(),
    created_by: z.string().optional()
  }, async (params) => {
    const failed = params.failed_articulation_attempts ? params.failed_articulation_attempts.split('|') : undefined;
    const result = await convertGapToEdge({ ...params, failed_articulation_attempts: failed });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  });

  server.tool('expand_edge_node', {
    edge_node_id: z.string(), gap_name: z.string(), gap_notes: z.string(),
    description: z.string().optional(), created_by: z.string().optional()
  }, async (params) => {
    const result = await expandEdgeNode(params);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  });

  // --- Working-intent tools ---
  server.tool('select_working_intent', {
    intent_ids: z.string(),
    graph_id: z.string().optional()
  }, async (params) => {
    const ids = params.intent_ids.split(',').map(s => s.trim());
    // Validate all intents exist
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
    const result = await pool.query(
      `SELECT id, name, type FROM gdd.nodes WHERE id IN (${placeholders})`,
      ids
    );
    const found = result.rows;
    const foundIds = found.map(r => r.id);
    const missing = ids.filter(id => !foundIds.includes(id));
    if (missing.length > 0) {
      return { content: [{ type: 'text', text: `Intent(s) not found: ${missing.join(', ')}` }], isError: true };
    }
    const state = {
      intents: found.map(r => ({ id: r.id, name: r.name, type: r.type })),
      graph_id: params.graph_id || null,
      selected_at: new Date().toISOString()
    };
    fs.mkdirSync(path.dirname(WORKING_INTENT_FILE), { recursive: true });
    fs.writeFileSync(WORKING_INTENT_FILE, JSON.stringify(state, null, 2));
    return { content: [{ type: 'text', text: `Working intent set: ${found.map(r => `${r.id} (${r.name})`).join(', ')}` }] };
  });

  server.tool('clear_working_intent', {}, async () => {
    try {
      fs.unlinkSync(WORKING_INTENT_FILE);
      return { content: [{ type: 'text', text: 'Working intent cleared.' }] };
    } catch (e) {
      if (e.code === 'ENOENT') {
        return { content: [{ type: 'text', text: 'No working intent was set.' }] };
      }
      throw e;
    }
  });

  server.tool('get_working_intent', {}, async () => {
    try {
      const data = JSON.parse(fs.readFileSync(WORKING_INTENT_FILE, 'utf8'));
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    } catch (e) {
      if (e.code === 'ENOENT') {
        return { content: [{ type: 'text', text: 'No working intent selected.' }] };
      }
      throw e;
    }
  });

  return server;
}

function mountMcp(app) {
  const server = createMcpServer();

  app.all('/mcp', async (req, res) => {
    try {
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on('close', () => transport.close());
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch (err) {
      if (!res.headersSent) {
        res.status(500).json({ error: err.message });
      }
    }
  });

  return server;
}

module.exports = { createMcpServer, mountMcp };
