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
const { queryIncomplete } = require('./operations/queryIncomplete');
const { querySkills } = require('./operations/querySkills');
const { buildProjection } = require('./operations/buildProjection');
const { clientSession } = require('./operations/clientSession');
const { queryAgents } = require('./operations/queryAgents');
const { createGraph, addNodeToGraph, removeNodeFromGraph, queryGraphNodes, nodeGraphs } = require('./operations/graphOperations');
const { pool } = require('./db');

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
    intent_ids: z.string(), name: z.string(),
    description: z.string().optional(), artifacts: z.string()
  }, async (params) => {
    const intent_ids = params.intent_ids.split(',').map(s => s.trim());
    const artifacts = JSON.parse(params.artifacts);
    const result = await recordExpression({ intent_ids, name: params.name, description: params.description, artifacts });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  });

  server.tool('link_expression', { expression_id: z.string(), intent_id: z.string() }, async (params) => {
    const result = await linkExpression(params);
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
