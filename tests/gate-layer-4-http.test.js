const request = require('supertest');
const { app } = require('../src/server');
const { pool } = require('../src/db');

async function cleanup() {
  await pool.query("DELETE FROM gdd.edges WHERE from_node LIKE 'test-%' OR to_node LIKE 'test-%'");
  await pool.query("DELETE FROM gdd.graph_memberships WHERE node_id LIKE 'test-%' OR graph_id LIKE 'test-%'");
  await pool.query("DELETE FROM gdd.nodes WHERE id LIKE 'test-%'");
  await pool.query("DELETE FROM gdd.graphs WHERE id LIKE 'test-%'");
  await pool.query("DELETE FROM gdd.llm_providers WHERE name LIKE 'test-%'");
}

beforeEach(async () => { await cleanup(); });
afterAll(async () => { await cleanup(); await pool.end(); });

describe('HTTP API - Gate 4', () => {
  test('POST /api/intents - creates intent', async () => {
    const res = await request(app).post('/api/intents').send({
      id: 'test-http-1', type: 'implement-operation', name: 'HTTP test', test_condition: 'Endpoint works'
    });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('test-http-1');
  });

  test('POST /api/intents - rejects missing test_condition', async () => {
    const res = await request(app).post('/api/intents').send({
      id: 'test-http-bad', type: 'implement-operation', name: 'Bad'
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('test_condition');
  });

  test('POST /api/edges - creates edge', async () => {
    await request(app).post('/api/intents').send({ id: 'test-http-a', type: 'implement-operation', name: 'A', test_condition: 'A' });
    await request(app).post('/api/intents').send({ id: 'test-http-b', type: 'implement-operation', name: 'B', test_condition: 'B' });
    const res = await request(app).post('/api/edges').send({ from_node: 'test-http-b', to_node: 'test-http-a', edge_type: 'blocked-by' });
    expect(res.status).toBe(200);
    expect(res.body.edge_type).toBe('blocked-by');
  });

  test('POST /api/expressions - records expression', async () => {
    await request(app).post('/api/intents').send({ id: 'test-http-target', type: 'implement-operation', name: 'T', test_condition: 'T' });
    const res = await request(app).post('/api/expressions').send({
      intent_ids: ['test-http-target'], artifacts: { files: ['x.js'] }, name: 'Built it'
    });
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('expression');
  });

  test('GET /api/incomplete - returns red intents', async () => {
    await request(app).post('/api/intents').send({ id: 'test-http-red', type: 'implement-operation', name: 'Red', test_condition: 'Red' });
    const res = await request(app).get('/api/incomplete');
    expect(res.status).toBe(200);
    expect(res.body.map(n => n.id)).toContain('test-http-red');
  });

  test('GET /api/incomplete?workable=true - filters blocked', async () => {
    await request(app).post('/api/intents').send({ id: 'test-http-dep', type: 'implement-operation', name: 'Dep', test_condition: 'D' });
    await request(app).post('/api/intents').send({ id: 'test-http-blocked', type: 'implement-operation', name: 'Blocked', test_condition: 'B' });
    await request(app).post('/api/edges').send({ from_node: 'test-http-blocked', to_node: 'test-http-dep', edge_type: 'blocked-by' });

    const res = await request(app).get('/api/incomplete?workable=true');
    const ids = res.body.map(n => n.id);
    expect(ids).toContain('test-http-dep');
    expect(ids).not.toContain('test-http-blocked');
  });

  test('GET /api/dependencies/:id - returns traversal', async () => {
    await request(app).post('/api/intents').send({ id: 'test-http-c1', type: 'implement-operation', name: 'C1', test_condition: 'C1' });
    await request(app).post('/api/intents').send({ id: 'test-http-c2', type: 'implement-operation', name: 'C2', test_condition: 'C2' });
    await request(app).post('/api/edges').send({ from_node: 'test-http-c2', to_node: 'test-http-c1', edge_type: 'blocked-by' });

    const res = await request(app).get('/api/dependencies/test-http-c2');
    expect(res.status).toBe(200);
    expect(res.body.upstream.map(n => n.id)).toContain('test-http-c1');
  });

  test('GET /api/nodes/:id - returns node', async () => {
    await request(app).post('/api/intents').send({ id: 'test-http-lookup', type: 'implement-operation', name: 'Lookup', test_condition: 'L' });
    const res = await request(app).get('/api/nodes/test-http-lookup');
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Lookup');
  });

  test('LLM provider CRUD', async () => {
    const create = await request(app).post('/api/settings/llm').send({
      name: 'test-provider', provider: 'anthropic', api_key: 'sk-test-123', model: 'claude-3'
    });
    expect(create.status).toBe(200);
    expect(create.body.name).toBe('test-provider');

    const list = await request(app).get('/api/settings/llm');
    expect(list.body.some(p => p.name === 'test-provider')).toBe(true);

    const activate = await request(app).put(`/api/settings/llm/${create.body.id}/activate`);
    expect(activate.body.is_active).toBe(true);
  });
});
