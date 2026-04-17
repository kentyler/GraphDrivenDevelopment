const { createIntent, createSession, buildProjection, closeSession, pool } = require('../src/db');

async function testProjections() {
    console.log('Starting Projections and Sessions Test...');
    const testSessionId = `test-session-proj-${Date.now()}`;

    try {
        await pool.query('INSERT INTO gdd.sessions (id, intent_id, actor_type, actor_id) VALUES ($1, $2, $3, $4)',
            [testSessionId, 'gdd-root', 'human', 'tester']);

        await createIntent({
            id: 'test-proj-a',
            type: 'implement-operation',
            name: 'Proj Node A',
            test: { condition: 'true' }
        }, testSessionId);

        await createIntent({
            id: 'test-proj-b',
            type: 'implement-operation',
            name: 'Proj Node B',
            test: { condition: 'true' },
            blocked_by: ['test-proj-a']
        }, testSessionId);

        console.log('1. Testing buildProjection...');
        const projection = await buildProjection('test-proj-b');
        console.log('Projection for B:', projection.vantage.name);
        if (projection.vantage.id !== 'test-proj-b') throw new Error('Incorrect vantage node');
        if (projection.upstream.length !== 1 || projection.upstream[0].id !== 'test-proj-a') throw new Error('Missing upstream dependency in projection');

        console.log('2. Testing closeSession and diff...');
        const closedSession = await closeSession(testSessionId);
        console.log('Closed session status:', closedSession.status);
        if (closedSession.status !== 'closed') throw new Error('Session should be closed');
        if (closedSession.diff.length < 2) throw new Error('Diff should contain mutations');

        console.log('Projections and Sessions Test Passed!');
    } catch (e) {
        console.error('Test Failed:', e);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

testProjections();
