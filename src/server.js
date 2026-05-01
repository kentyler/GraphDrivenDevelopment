const express = require('express');
const path = require('path');
require('dotenv').config();

const { createIntent } = require('./operations/createIntent');
const { createEdge } = require('./operations/createEdge');
const { recordExpression } = require('./operations/recordExpression');
const { linkExpression } = require('./operations/linkExpression');
const { createGap } = require('./operations/createGap');
const { createDecision } = require('./operations/createDecision');
const { supersedeIntent } = require('./operations/supersedeIntent');
const { traverseDependencies } = require('./operations/traverseDependencies');
const { queryIncomplete } = require('./operations/queryIncomplete');
const { querySkills } = require('./operations/querySkills');
const { queryCurrentNodes } = require('./operations/queryCurrentNodes');
const { createGraph, addNodeToGraph, removeNodeFromGraph, queryGraphNodes, nodeGraphs } = require('./operations/graphOperations');
const { buildProjection } = require('./operations/buildProjection');
const { renderHuman } = require('./operations/renderHuman');
const { renderLLM } = require('./operations/renderLLM');
const { translateRepresentation } = require('./operations/translateRepresentation');
const { clientSession } = require('./operations/clientSession');
const { transduceExternal } = require('./operations/transduceExternal');
const { defineAgent } = require('./operations/defineAgent');
const { activateAgent } = require('./operations/activateAgent');
const { queryAgents } = require('./operations/queryAgents');
const { pool } = require('./db');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Error wrapper
function wrap(fn) {
  return async (req, res) => {
    try {
      const result = await fn(req, res);
      res.json(result);
    } catch (err) {
      res.status(err.status || 400).json({ error: err.message });
    }
  };
}

// --- Node operations ---
app.post('/api/intents', wrap(async (req) => createIntent(req.body)));
app.post('/api/edges', wrap(async (req) => createEdge(req.body)));
app.post('/api/expressions', wrap(async (req) => recordExpression(req.body)));
app.post('/api/expressions/link', wrap(async (req) => linkExpression(req.body)));
app.post('/api/gaps', wrap(async (req) => createGap(req.body)));
app.post('/api/decisions', wrap(async (req) => createDecision(req.body)));
app.post('/api/supersede', wrap(async (req) => supersedeIntent(req.body)));

// --- Query operations ---
app.get('/api/incomplete', wrap(async (req) => {
  const workable = req.query.workable === 'true';
  const graph_id = req.query.graph_id || null;
  return queryIncomplete({ workable, graph_id });
}));

app.get('/api/dependencies/:id', wrap(async (req) => traverseDependencies(req.params.id)));

app.get('/api/projection/:id', wrap(async (req) => {
  const graph_id = req.query.graph_id || null;
  return buildProjection(req.params.id, { graph_id });
}));

app.get('/api/projection/:id/human', wrap(async (req) => {
  const graph_id = req.query.graph_id || null;
  const projection = await buildProjection(req.params.id, { graph_id });
  return { markdown: renderHuman(projection) };
}));

app.get('/api/projection/:id/llm', wrap(async (req) => {
  const graph_id = req.query.graph_id || null;
  const projection = await buildProjection(req.params.id, { graph_id });
  return renderLLM(projection);
}));

app.get('/api/current', wrap(async (req) => {
  const pattern = req.query.pattern;
  if (!pattern) throw new Error('pattern query parameter is required');
  return queryCurrentNodes({ pattern: pattern + '%' });
}));

app.get('/api/skills', wrap(async (req) => {
  const category = req.query.category || null;
  return querySkills({ category });
}));

// --- Graph operations ---
app.post('/api/graphs', wrap(async (req) => createGraph(req.body)));
app.post('/api/graphs/add-node', wrap(async (req) => addNodeToGraph(req.body)));
app.post('/api/graphs/remove-node', wrap(async (req) => removeNodeFromGraph(req.body)));
app.get('/api/graphs/:id/nodes', wrap(async (req) => {
  const type = req.query.type || null;
  return queryGraphNodes({ graph_id: req.params.id, type });
}));
app.get('/api/nodes/:id/graphs', wrap(async (req) => nodeGraphs(req.params.id)));

// --- Node lookup ---
app.get('/api/nodes/:id', wrap(async (req) => {
  const result = await pool.query('SELECT * FROM gdd.nodes WHERE id = $1', [req.params.id]);
  if (result.rows.length === 0) throw Object.assign(new Error('Not found'), { status: 404 });
  return result.rows[0];
}));

// --- LLM Providers ---
app.get('/api/settings/llm', wrap(async () => {
  const result = await pool.query('SELECT id, name, provider, model, is_active, created_at FROM gdd.llm_providers ORDER BY name');
  return result.rows;
}));

app.post('/api/settings/llm', wrap(async (req) => {
  const { name, provider, api_key, model, is_active } = req.body;
  if (!name || !provider || !api_key) throw new Error('name, provider, and api_key are required');
  const result = await pool.query(`
    INSERT INTO gdd.llm_providers (name, provider, api_key, model, is_active)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id, name, provider, model, is_active, created_at
  `, [name, provider, api_key, model || null, is_active || false]);
  return result.rows[0];
}));

app.put('/api/settings/llm/:id/activate', wrap(async (req) => {
  await pool.query('UPDATE gdd.llm_providers SET is_active = FALSE');
  const result = await pool.query('UPDATE gdd.llm_providers SET is_active = TRUE WHERE id = $1 RETURNING id, name, provider, model, is_active', [req.params.id]);
  if (result.rows.length === 0) throw Object.assign(new Error('Provider not found'), { status: 404 });
  return result.rows[0];
}));

// --- Agent operations ---
app.post('/api/agents', wrap(async (req) => defineAgent(req.body)));
app.post('/api/agents/:id/activate', wrap(async (req) => activateAgent(req.params.id)));
app.get('/api/agents', wrap(async (req) => {
  const { status, intent_id } = req.query;
  return queryAgents({ status, intent_id });
}));

// --- Client intake / transduction ---
app.post('/api/client-session', wrap(async (req) => {
  const { input, client_id, context_intent_id } = req.body;
  // Note: LLM function must be injected at runtime from active provider
  // For now, returns 501 if no provider is active
  return clientSession(input, { client_id, context_intent_id });
}));

app.post('/api/transduce-external', wrap(async (req) => {
  const { event_description, interpreter, context_intent_id } = req.body;
  return transduceExternal(event_description, { interpreter, context_intent_id });
}));

// --- MCP Server ---
const { mountMcp } = require('./mcp');
mountMcp(app);

const PORT = process.env.PORT || 3000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`GDD server running on http://localhost:${PORT}`);
    console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
    console.log(`Dashboard: http://localhost:${PORT}/`);
  });
}

module.exports = { app };
