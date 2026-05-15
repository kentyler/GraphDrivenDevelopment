const http = require('http');
const { app } = require('../src/server');

function get(path) {
  return new Promise((resolve, reject) => {
    http.get('http://localhost:3002' + path, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
    }).on('error', reject);
  });
}

function post(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request('http://localhost:3002' + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
    }, (res) => {
      let resData = '';
      res.on('data', chunk => resData += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(resData) }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function run() {
  const server = app.listen(3002);
  let passed = 0;
  let failed = 0;

  function check(label, condition) {
    if (condition) {
      console.log('  PASS: ' + label);
      passed++;
    } else {
      console.log('  FAIL: ' + label);
      failed++;
    }
  }

  try {
    // 1. GET /api/boards returns default board
    console.log('\n1. GET /api/boards');
    const boards = await get('/api/boards');
    check('returns array', Array.isArray(boards.body));
    check('has default board', boards.body.some(b => b.id === 'default-board'));

    // 2. GET /api/incomplete still returns only graph nodes (no edge nodes)
    console.log('\n2. GET /api/incomplete excludes edge nodes');
    const incomplete = await get('/api/incomplete');
    const hasEdge = incomplete.body.some(n => n.id.startsWith('edge-'));
    check('no edge nodes in incomplete', !hasEdge);

    // 3. GET /api/edge-nodes returns seed edge node
    console.log('\n3. GET /api/edge-nodes');
    const edgeNodes = await get('/api/edge-nodes');
    check('returns array', Array.isArray(edgeNodes.body));
    check('has seed edge node', edgeNodes.body.some(e => e.id === 'edge-multi-board-architecture'));

    // 4. Create edge node
    console.log('\n4. POST /api/edge-nodes');
    const newEdge = await post('/api/edge-nodes', {
      name: 'Test boundary',
      content: 'A test edge node',
      board_id: 'default-board',
      weight: 0.5,
      created_by: 'test'
    });
    check('creates edge node', newEdge.status === 200);
    check('has id', Boolean(newEdge.body.id));
    const testEdgeId = newEdge.body.id;

    // 5. Record sensitivity reading
    console.log('\n5. POST /api/edge-nodes/:id/sensitivity-readings');
    const reading = await post('/api/edge-nodes/' + testEdgeId + '/sensitivity-readings', {
      signal: 'Pressure increasing on this boundary',
      read_by: 'test',
      board_impact: 'shifting'
    });
    check('creates reading', reading.status === 200);
    check('has board_impact', reading.body.board_impact === 'shifting');

    // 6. GET edge node detail
    console.log('\n6. GET /api/edge-nodes/:id');
    const detail = await get('/api/edge-nodes/' + testEdgeId);
    check('has sensitivity_readings', Array.isArray(detail.body.sensitivity_readings));
    check('reading present', detail.body.sensitivity_readings.length === 1);

    // 7. Projection includes board + edge context
    console.log('\n7. GET /api/projection/gdd-root/llm');
    const proj = await get('/api/projection/gdd-root/llm');
    check('has board', proj.body.board !== null && proj.body.board !== undefined);
    check('has edge_nodes', Array.isArray(proj.body.edge_nodes));
    check('board has statement', Boolean(proj.body.board && proj.body.board.statement));

    // 8. Record tension reading on board
    console.log('\n8. POST /api/boards/:id/tension-readings');
    const tension = await post('/api/boards/default-board/tension-readings', {
      signal: 'System growing but stable',
      read_by: 'test',
      tension_character: 'generative'
    });
    check('creates tension', tension.status === 200);
    check('has tension_character', tension.body.tension_character === 'generative');

    // 9. GET board detail
    console.log('\n9. GET /api/boards/:id');
    const boardDetail = await get('/api/boards/default-board');
    check('has latest_tension', boardDetail.body.latest_tension !== null);
    check('has edge count', boardDetail.body.active_edge_node_count >= 1);

    // 10. Test conversion: create gap, then convert
    console.log('\n10. Convert gap to edge');
    const gap = await post('/api/gaps', {
      name: 'Test gap for conversion',
      notes: 'This gap should become an edge',
      board_id: 'default-board'
    });
    check('gap created', gap.status === 200);
    const gapId = gap.body.id;

    const conversion = await post('/api/edge-nodes/convert-gap', {
      gap_id: gapId,
      board_id: 'default-board',
      content: 'Converted boundary',
      description: 'Decided this is a boundary'
    });
    check('conversion created edge', Boolean(conversion.body.edge_node));
    check('conversion created decision', Boolean(conversion.body.decision));
    check('edge has source_gap_id', conversion.body.edge_node.source_gap_id === gapId);

    // 11. Test expansion: create edge, then expand
    console.log('\n11. Expand edge node');
    const edgeForExpand = await post('/api/edge-nodes', {
      name: 'Boundary to expand',
      content: 'Will become interior work',
      board_id: 'default-board'
    });
    const expandResult = await post('/api/edge-nodes/' + edgeForExpand.body.id + '/expand', {
      gap_name: 'Work from expanded boundary',
      gap_notes: 'This was an edge, now it is interior work',
      description: 'Boundary moved inward'
    });
    check('expansion returns edge node', Boolean(expandResult.body.edge_node));
    check('edge status is expanded', expandResult.body.edge_node.status === 'expanded');
    check('expansion created gap', Boolean(expandResult.body.gap));
    check('gap has board_id', expandResult.body.gap.board_id === 'default-board');

    // 12. Board filter on incomplete
    console.log('\n12. Board filter on /api/incomplete');
    const filtered = await get('/api/incomplete?board_id=default-board');
    check('returns results', Array.isArray(filtered.body));

    // Cleanup: delete test data
    const { pool } = require('../src/db');
    await pool.query("DELETE FROM gdd.sensitivity_readings WHERE read_by = 'test'");
    await pool.query("DELETE FROM gdd.tension_readings WHERE read_by = 'test'");
    await pool.query("DELETE FROM gdd.expansion_events WHERE edge_node_id = $1", [edgeForExpand.body.id]);
    await pool.query("DELETE FROM gdd.conversion_events WHERE edge_node_id = $1", [conversion.body.edge_node.id]);
    await pool.query("DELETE FROM gdd.edge_nodes WHERE created_by = 'test'");
    await pool.query("DELETE FROM gdd.edge_nodes WHERE id = $1", [conversion.body.edge_node.id]);
    await pool.query("DELETE FROM gdd.edges WHERE from_node = $1", [conversion.body.decision.id]);
    await pool.query("DELETE FROM gdd.nodes WHERE id IN ($1, $2, $3)", [gapId, conversion.body.decision.id, expandResult.body.gap.id]);
    await pool.end();

    console.log('\n---');
    console.log(`Results: ${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    server.close();
  }
}

run();
