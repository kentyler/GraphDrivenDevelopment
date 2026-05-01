const { pool } = require('../src/db');
const { createIntent } = require('../src/operations/createIntent');
const { createEdge } = require('../src/operations/createEdge');
const { recordExpression } = require('../src/operations/recordExpression');
const { linkExpression } = require('../src/operations/linkExpression');
const { createGap } = require('../src/operations/createGap');
const { createDecision } = require('../src/operations/createDecision');
const { supersedeIntent } = require('../src/operations/supersedeIntent');
const { traverseDependencies } = require('../src/operations/traverseDependencies');
const { queryIncomplete } = require('../src/operations/queryIncomplete');
const { querySkills } = require('../src/operations/querySkills');
const { createGraph, addNodeToGraph, removeNodeFromGraph, queryGraphNodes, nodeGraphs } = require('../src/operations/graphOperations');

// Cleanup helper
async function cleanup() {
  await pool.query("DELETE FROM gdd.edges WHERE from_node LIKE 'test-%' OR to_node LIKE 'test-%'");
  await pool.query("DELETE FROM gdd.graph_memberships WHERE node_id LIKE 'test-%' OR graph_id LIKE 'test-%'");
  await pool.query("DELETE FROM gdd.nodes WHERE id LIKE 'test-%'");
  await pool.query("DELETE FROM gdd.graphs WHERE id LIKE 'test-%'");
  await pool.query("DELETE FROM gdd.skills WHERE id LIKE 'test-%'");
}

beforeEach(async () => { await cleanup(); });
afterAll(async () => { await cleanup(); await pool.end(); });

describe('Layer 1: Core Writes', () => {
  test('createIntent - creates intent with test_condition', async () => {
    const node = await createIntent({ id: 'test-intent-1', type: 'implement-operation', name: 'Test op', description: 'A test', test_condition: 'It works', test_verification: 'Check it' });
    expect(node.id).toBe('test-intent-1');
    expect(node.type).toBe('implement-operation');
    expect(node.test_condition).toBe('It works');
  });

  test('createIntent - rejects intent type without test_condition', async () => {
    await expect(createIntent({ id: 'test-bad', type: 'implement-operation', name: 'Bad', test_condition: '' }))
      .rejects.toThrow('requires a non-empty test_condition');
  });

  test('createIntent - gap requires notes', async () => {
    await expect(createIntent({ id: 'test-gap-bad', type: 'gap', name: 'Bad gap' }))
      .rejects.toThrow('requires notes');
  });

  test('createIntent - gap with notes succeeds', async () => {
    const gap = await createIntent({ id: 'test-gap-1', type: 'gap', name: 'Test gap', notes: 'Something is unclear' });
    expect(gap.type).toBe('gap');
    expect(gap.test_condition).toBeNull();
    expect(gap.notes).toBe('Something is unclear');
  });

  test('createIntent - expression requires artifacts', async () => {
    await expect(createIntent({ id: 'test-expr-bad', type: 'expression', name: 'Bad expr' }))
      .rejects.toThrow('requires artifacts');
  });

  test('createIntent - compose has null test_condition', async () => {
    const compose = await createIntent({ id: 'test-compose-1', type: 'compose', name: 'Group' });
    expect(compose.test_condition).toBeNull();
  });

  test('createEdge - creates edge between existing nodes', async () => {
    await createIntent({ id: 'test-a', type: 'implement-operation', name: 'A', test_condition: 'A works' });
    await createIntent({ id: 'test-b', type: 'implement-operation', name: 'B', test_condition: 'B works' });
    const edge = await createEdge({ from_node: 'test-b', to_node: 'test-a', edge_type: 'blocked-by' });
    expect(edge.edge_type).toBe('blocked-by');
  });

  test('createEdge - rejects non-existent node', async () => {
    await expect(createEdge({ from_node: 'test-nonexistent', to_node: 'test-also-not', edge_type: 'blocked-by' }))
      .rejects.toThrow('does not exist');
  });

  test('recordExpression - creates expression and satisfies edges', async () => {
    await createIntent({ id: 'test-target', type: 'implement-operation', name: 'Target', test_condition: 'Target passes' });
    const expr = await recordExpression({ intent_ids: ['test-target'], artifacts: { files: ['src/thing.js'] }, name: 'Implemented thing' });
    expect(expr.type).toBe('expression');

    // Verify satisfies edge
    const edges = await pool.query("SELECT * FROM gdd.edges WHERE to_node = 'test-target' AND edge_type = 'satisfies'");
    expect(edges.rows.length).toBe(1);
    expect(edges.rows[0].from_node).toBe(expr.id);
  });

  test('recordExpression - multi-intent satisfaction', async () => {
    await createIntent({ id: 'test-x', type: 'implement-operation', name: 'X', test_condition: 'X' });
    await createIntent({ id: 'test-y', type: 'implement-operation', name: 'Y', test_condition: 'Y' });
    const expr = await recordExpression({ intent_ids: ['test-x', 'test-y'], artifacts: { files: ['shared.js'] }, name: 'Shared impl' });

    const edgesX = await pool.query("SELECT * FROM gdd.edges WHERE to_node = 'test-x' AND edge_type = 'satisfies'");
    const edgesY = await pool.query("SELECT * FROM gdd.edges WHERE to_node = 'test-y' AND edge_type = 'satisfies'");
    expect(edgesX.rows.length).toBe(1);
    expect(edgesY.rows.length).toBe(1);
  });

  test('linkExpression - adds satisfies edge to existing expression', async () => {
    await createIntent({ id: 'test-p', type: 'implement-operation', name: 'P', test_condition: 'P' });
    await createIntent({ id: 'test-q', type: 'implement-operation', name: 'Q', test_condition: 'Q' });
    const expr = await recordExpression({ intent_ids: ['test-p'], artifacts: { files: ['p.js'] }, name: 'P impl' });
    await linkExpression({ expression_id: expr.id, intent_id: 'test-q' });

    const edges = await pool.query("SELECT * FROM gdd.edges WHERE to_node = 'test-q' AND edge_type = 'satisfies'");
    expect(edges.rows.length).toBe(1);
  });

  test('linkExpression - rejects non-expression node', async () => {
    await createIntent({ id: 'test-not-expr', type: 'implement-operation', name: 'Not expr', test_condition: 'X' });
    await createIntent({ id: 'test-target2', type: 'implement-operation', name: 'Target2', test_condition: 'Y' });
    await expect(linkExpression({ expression_id: 'test-not-expr', intent_id: 'test-target2' }))
      .rejects.toThrow('is not an expression node');
  });

  test('createGap - creates gap with notes', async () => {
    const gap = await createGap({ id: 'test-gap-2', name: 'Stuck on auth', notes: 'JWT vs session unclear' });
    expect(gap.type).toBe('gap');
    expect(gap.notes).toBe('JWT vs session unclear');
  });

  test('createDecision - creates decision with closes edges', async () => {
    await createGap({ id: 'test-gap-3', name: 'Auth unclear', notes: 'Need decision' });
    const decision = await createDecision({ id: 'test-decision-1', name: 'Chose JWT', description: 'JWT for stateless auth', notes: 'Considered sessions, JWT, OAuth. JWT chosen for simplicity.', closes: ['test-gap-3'] });
    expect(decision.type).toBe('decision');

    const edges = await pool.query("SELECT * FROM gdd.edges WHERE from_node = 'test-decision-1' AND edge_type = 'closes'");
    expect(edges.rows.length).toBe(1);
    expect(edges.rows[0].to_node).toBe('test-gap-3');
  });

  test('supersedeIntent - marks old intent as superseded', async () => {
    await createIntent({ id: 'test-old', type: 'implement-operation', name: 'Old way', test_condition: 'Old' });
    await createIntent({ id: 'test-new', type: 'implement-operation', name: 'New way', test_condition: 'New' });
    await supersedeIntent({ new_intent_id: 'test-new', old_intent_id: 'test-old' });

    const edges = await pool.query("SELECT * FROM gdd.edges WHERE from_node = 'test-new' AND to_node = 'test-old' AND edge_type = 'supersedes'");
    expect(edges.rows.length).toBe(1);
  });
});

describe('Layer 1: Graph Operations', () => {
  test('createGraph + addNodeToGraph + queryGraphNodes', async () => {
    await createGraph({ id: 'test-graph-1', name: 'Test Graph', owner: 'ken' });
    await createIntent({ id: 'test-gn-1', type: 'implement-operation', name: 'Node 1', test_condition: 'Works' });
    await addNodeToGraph({ graph_id: 'test-graph-1', node_id: 'test-gn-1' });

    const nodes = await queryGraphNodes({ graph_id: 'test-graph-1' });
    expect(nodes.length).toBe(1);
    expect(nodes[0].id).toBe('test-gn-1');
  });

  test('removeNodeFromGraph - removes membership, node persists', async () => {
    await createGraph({ id: 'test-graph-2', name: 'G2', owner: 'ken' });
    await createGraph({ id: 'test-graph-3', name: 'G3', owner: 'ken' });
    await createIntent({ id: 'test-gn-2', type: 'implement-operation', name: 'Node 2', test_condition: 'Works' });
    await addNodeToGraph({ graph_id: 'test-graph-2', node_id: 'test-gn-2' });
    await addNodeToGraph({ graph_id: 'test-graph-3', node_id: 'test-gn-2' });

    await removeNodeFromGraph({ graph_id: 'test-graph-2', node_id: 'test-gn-2' });

    const g2Nodes = await queryGraphNodes({ graph_id: 'test-graph-2' });
    const g3Nodes = await queryGraphNodes({ graph_id: 'test-graph-3' });
    expect(g2Nodes.length).toBe(0);
    expect(g3Nodes.length).toBe(1);
  });

  test('nodeGraphs - returns all graphs for a node', async () => {
    await createGraph({ id: 'test-graph-4', name: 'G4', owner: 'ken' });
    await createGraph({ id: 'test-graph-5', name: 'G5', owner: 'ken' });
    await createIntent({ id: 'test-gn-3', type: 'implement-operation', name: 'N3', test_condition: 'Y' });
    await addNodeToGraph({ graph_id: 'test-graph-4', node_id: 'test-gn-3' });
    await addNodeToGraph({ graph_id: 'test-graph-5', node_id: 'test-gn-3' });

    const graphs = await nodeGraphs('test-gn-3');
    expect(graphs.length).toBe(2);
  });
});

describe('Layer 1+3: Core Reads', () => {
  test('traverseDependencies - returns upstream and downstream', async () => {
    await createIntent({ id: 'test-chain-a', type: 'implement-operation', name: 'A', test_condition: 'A' });
    await createIntent({ id: 'test-chain-b', type: 'implement-operation', name: 'B', test_condition: 'B' });
    await createIntent({ id: 'test-chain-c', type: 'implement-operation', name: 'C', test_condition: 'C' });
    await createEdge({ from_node: 'test-chain-b', to_node: 'test-chain-a', edge_type: 'blocked-by' });
    await createEdge({ from_node: 'test-chain-c', to_node: 'test-chain-b', edge_type: 'blocked-by' });

    const result = await traverseDependencies('test-chain-b');
    expect(result.vantage.id).toBe('test-chain-b');
    expect(result.upstream.map(n => n.id)).toContain('test-chain-a');
    expect(result.downstream.map(n => n.id)).toContain('test-chain-c');
  });

  test('queryIncomplete - returns red, current intents', async () => {
    await createIntent({ id: 'test-red-1', type: 'implement-operation', name: 'Red', test_condition: 'Red' });
    await createIntent({ id: 'test-green-1', type: 'implement-operation', name: 'Green', test_condition: 'Green' });
    await recordExpression({ intent_ids: ['test-green-1'], artifacts: { files: ['g.js'] }, name: 'Green impl' });

    const incomplete = await queryIncomplete();
    const ids = incomplete.map(n => n.id);
    expect(ids).toContain('test-red-1');
    expect(ids).not.toContain('test-green-1');
  });

  test('queryIncomplete - excludes superseded intents', async () => {
    await createIntent({ id: 'test-superseded', type: 'implement-operation', name: 'Old', test_condition: 'Old' });
    await createIntent({ id: 'test-replacement', type: 'implement-operation', name: 'New', test_condition: 'New' });
    await supersedeIntent({ new_intent_id: 'test-replacement', old_intent_id: 'test-superseded' });

    const incomplete = await queryIncomplete();
    const ids = incomplete.map(n => n.id);
    expect(ids).not.toContain('test-superseded');
    expect(ids).toContain('test-replacement');
  });

  test('queryIncomplete - excludes expression, decision, signal nodes', async () => {
    await createIntent({ id: 'test-signal-1', type: 'signal', name: 'Event', notes: 'Something happened' });
    await createDecision({ id: 'test-dec-1', name: 'Decided', notes: 'We chose this' });

    const incomplete = await queryIncomplete();
    const ids = incomplete.map(n => n.id);
    expect(ids).not.toContain('test-signal-1');
    expect(ids).not.toContain('test-dec-1');
  });

  test('queryIncomplete - includes gap nodes', async () => {
    await createGap({ id: 'test-gap-qi', name: 'Blocked', notes: 'Unclear' });

    const incomplete = await queryIncomplete();
    const ids = incomplete.map(n => n.id);
    expect(ids).toContain('test-gap-qi');
  });

  test('queryIncomplete - workable filter', async () => {
    await createIntent({ id: 'test-dep', type: 'implement-operation', name: 'Dep', test_condition: 'Dep' });
    await createIntent({ id: 'test-blocked', type: 'implement-operation', name: 'Blocked', test_condition: 'Blocked' });
    await createIntent({ id: 'test-free', type: 'implement-operation', name: 'Free', test_condition: 'Free' });
    await createEdge({ from_node: 'test-blocked', to_node: 'test-dep', edge_type: 'blocked-by' });

    const workable = await queryIncomplete({ workable: true });
    const ids = workable.map(n => n.id);
    expect(ids).toContain('test-free');
    expect(ids).toContain('test-dep');
    expect(ids).not.toContain('test-blocked');
  });

  test('querySkills - returns skills filtered by category', async () => {
    await pool.query("INSERT INTO gdd.skills (id, name, description, category) VALUES ('test-skill-1', 'Skill A', 'A skill', 'data'), ('test-skill-2', 'Skill B', 'B skill', 'ui')");

    const all = await querySkills();
    expect(all.length).toBeGreaterThanOrEqual(2);

    const dataOnly = await querySkills({ category: 'data' });
    expect(dataOnly.every(s => s.category === 'data')).toBe(true);
  });
});
