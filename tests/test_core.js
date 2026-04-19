const { createIntent, createEdge, createSession, recordExpression, queryIncomplete, pool } = require('../src/db');

async function testCore() {
  console.log('Starting Core Operations Test...');

  try {
    // Cleanup
    await pool.query('DELETE FROM gdd.mutations WHERE session_id LIKE \'test-%\'');
    await pool.query('DELETE FROM gdd.expressions WHERE session_id LIKE \'test-%\'');
    await pool.query('DELETE FROM gdd.edges WHERE from_node LIKE \'test-%\' OR to_node LIKE \'test-%\'');
    await pool.query('DELETE FROM gdd.nodes WHERE id LIKE \'test-%\' OR session_id LIKE \'test-%\'');
    await pool.query('DELETE FROM gdd.sessions WHERE id LIKE \'test-%\'');

    const testSessionId = 'test-session-1';
    await pool.query('INSERT INTO gdd.sessions (id, intent_id, actor_type, actor_id) VALUES ($1, $2, $3, $4)',
        [testSessionId, 'gdd-root', 'human', 'tester']);

    console.log('1. Testing Intent Creation...');
    const nodeA = await createIntent({
      id: 'test-node-a',
      type: 'implement-operation',
      name: 'Test Node A',
      description: 'First test node',
      test: { condition: 'Always true' }
    }, testSessionId);
    console.log('Created node A:', nodeA.id, 'Status:', nodeA.status);

    const nodeB = await createIntent({
      id: 'test-node-b',
      type: 'implement-operation',
      name: 'Test Node B',
      description: 'Second test node',
      test: { condition: 'Always true' },
      blocked_by: ['test-node-a']
    }, testSessionId);
    console.log('Created node B:', nodeB.id, 'Status:', nodeB.status);

    if (nodeB.status !== 'potential') {
        throw new Error(`Expected node B to be potential, but got ${nodeB.status}`);
    }

    console.log('2. Testing Incomplete Query...');
    let incomplete = await queryIncomplete();
    const activeIds = incomplete.map(n => n.id);
    console.log('Active nodes:', activeIds);
    if (!activeIds.includes('test-node-a')) throw new Error('Node A should be active');
    if (activeIds.includes('test-node-b')) throw new Error('Node B should NOT be active');

    console.log('3. Testing Expression Recording and Cascading...');
    await recordExpression('test-node-a', testSessionId, ['file.txt'], 'Done node A');

    const nodeARes = await pool.query('SELECT status FROM gdd.nodes WHERE id = \'test-node-a\'');
    console.log('Node A status after expression:', nodeARes.rows[0].status);
    if (nodeARes.rows[0].status !== 'satisfied') throw new Error('Node A should be satisfied');

    const nodeBRes = await pool.query('SELECT status FROM gdd.nodes WHERE id = \'test-node-b\'');
    console.log('Node B status after A satisfied:', nodeBRes.rows[0].status);
    if (nodeBRes.rows[0].status !== 'active') throw new Error('Node B should be active');

    incomplete = await queryIncomplete();
    console.log('Active nodes after A satisfied:', incomplete.map(n => n.id));
    if (!incomplete.find(n => n.id === 'test-node-b')) throw new Error('Node B should now be active');

    console.log('Core Operations Test Passed!');
  } catch (e) {
    console.error('Test Failed:', e);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

testCore();
