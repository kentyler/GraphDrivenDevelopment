const { buildProjection, pool } = require('../src/db');
const { renderHuman, renderLLM } = require('../src/render');

async function testRender() {
    console.log('Starting Rendering and Actor Test...');

    try {
        // Use a known node from previous test or gdd-root
        const projection = await buildProjection('gdd-root');

        console.log('1. Testing renderHuman...');
        const humanView = renderHuman(projection);
        console.log('Human View:\n', humanView);
        if (!humanView.includes('## Intent: GDD system exists and is operational')) throw new Error('Human view missing title');

        console.log('2. Testing renderLLM...');
        const llmView = renderLLM(projection);
        const parsed = JSON.parse(llmView);
        if (parsed.vantage.id !== 'gdd-root') throw new Error('LLM view incorrect');

        console.log('Rendering and Actor Test Passed!');
    } catch (e) {
        console.error('Test Failed:', e);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

testRender();
