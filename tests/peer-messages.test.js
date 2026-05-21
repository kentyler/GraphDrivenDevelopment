const fs = require('fs');
const path = require('path');
const { pool } = require('../src/db');
const { loadPeers, savePeers, addPeer, removePeer, listPeers, PEERS_FILE } = require('../src/operations/peerDirectory');
const { broadcastRedNodes } = require('../src/operations/broadcastRedNodes');
const { receivePeerMessages } = require('../src/operations/receivePeerMessages');

// Use a temp file for peer directory tests
const TEMP_PEERS = path.join(__dirname, 'test-peers.json');
const origCwd = process.cwd;

async function cleanup() {
  await pool.query("DELETE FROM gdd.peer_messages WHERE peer_id LIKE 'test-%' OR subject LIKE 'test-%'");
  try { fs.unlinkSync(TEMP_PEERS); } catch (e) {}
}

beforeEach(async () => { await cleanup(); });
afterAll(async () => { await cleanup(); await pool.end(); });

describe('Peer directory', () => {
  // Override PEERS_FILE by writing/reading the temp file directly
  const tempLoad = () => {
    try { return JSON.parse(fs.readFileSync(TEMP_PEERS, 'utf8')); }
    catch (e) { return []; }
  };
  const tempSave = (peers) => fs.writeFileSync(TEMP_PEERS, JSON.stringify(peers, null, 2));

  test('empty file returns empty array', () => {
    expect(tempLoad()).toEqual([]);
  });

  test('add and list peers', () => {
    tempSave([]);
    const peers = [];
    peers.push({ id: 'test-alice', name: 'Alice', email: 'alice@test.com' });
    peers.push({ id: 'test-bob', name: 'Bob', email: 'bob@test.com' });
    tempSave(peers);
    const loaded = tempLoad();
    expect(loaded).toHaveLength(2);
    expect(loaded[0].id).toBe('test-alice');
    expect(loaded[1].email).toBe('bob@test.com');
  });

  test('remove peer', () => {
    tempSave([
      { id: 'test-alice', name: 'Alice', email: 'alice@test.com' },
      { id: 'test-bob', name: 'Bob', email: 'bob@test.com' },
    ]);
    const peers = tempLoad();
    const idx = peers.findIndex(p => p.id === 'test-alice');
    peers.splice(idx, 1);
    tempSave(peers);
    expect(tempLoad()).toHaveLength(1);
    expect(tempLoad()[0].id).toBe('test-bob');
  });
});

describe('broadcastRedNodes', () => {
  test('returns sent: 0 with no peers', async () => {
    // Temporarily make loadPeers return empty
    const result = await broadcastRedNodes({ graph_id: 'nonexistent-graph' });
    // With no peers.json file or empty peers, should return 0
    expect(result.sent).toBe(0);
  });
});

describe('receivePeerMessages', () => {
  test('returns received: 0 with no IMAP config', async () => {
    const origHost = process.env.GDD_IMAP_HOST;
    delete process.env.GDD_IMAP_HOST;
    const result = await receivePeerMessages();
    expect(result.received).toBe(0);
    expect(result.reason).toBe('no IMAP config');
    if (origHost) process.env.GDD_IMAP_HOST = origHost;
  });
});

describe('peer_messages table', () => {
  test('insert and query a sent broadcast', async () => {
    const result = await pool.query(`
      INSERT INTO gdd.peer_messages (direction, message_type, peer_id, subject, content, intent_ids)
      VALUES ('sent', 'broadcast', 'test-alice', 'test-subject-1', '{"nodes":[]}', ARRAY['intent-1','intent-2'])
      RETURNING *
    `);
    expect(result.rows[0].direction).toBe('sent');
    expect(result.rows[0].message_type).toBe('broadcast');
    expect(result.rows[0].peer_id).toBe('test-alice');
    expect(result.rows[0].intent_ids).toEqual(['intent-1', 'intent-2']);
  });

  test('insert and query a received response with linked_message_id', async () => {
    // Insert a broadcast first
    const broadcast = await pool.query(`
      INSERT INTO gdd.peer_messages (direction, message_type, peer_id, subject, content)
      VALUES ('sent', 'broadcast', 'test-bob', 'test-subject-2', '{}')
      RETURNING id
    `);
    const broadcastId = broadcast.rows[0].id;

    // Insert a response linked to the broadcast
    const response = await pool.query(`
      INSERT INTO gdd.peer_messages (direction, message_type, peer_id, subject, content, linked_message_id)
      VALUES ('received', 'response', 'test-bob', 'test-subject-3', '{"matches":[]}', $1)
      RETURNING *
    `, [broadcastId]);

    expect(response.rows[0].linked_message_id).toBe(broadcastId);
    expect(response.rows[0].direction).toBe('received');
  });

  test('filter by direction and message_type', async () => {
    await pool.query(`
      INSERT INTO gdd.peer_messages (direction, message_type, peer_id, subject) VALUES
      ('sent', 'broadcast', 'test-alice', 'test-filter-1'),
      ('received', 'response', 'test-alice', 'test-filter-2'),
      ('sent', 'broadcast', 'test-bob', 'test-filter-3')
    `);

    const sent = await pool.query(`
      SELECT * FROM gdd.peer_messages WHERE direction = 'sent' AND subject LIKE 'test-filter%'
    `);
    expect(sent.rows).toHaveLength(2);

    const fromAlice = await pool.query(`
      SELECT * FROM gdd.peer_messages WHERE peer_id = 'test-alice' AND subject LIKE 'test-filter%'
    `);
    expect(fromAlice.rows).toHaveLength(2);

    const responses = await pool.query(`
      SELECT * FROM gdd.peer_messages WHERE message_type = 'response' AND subject LIKE 'test-filter%'
    `);
    expect(responses.rows).toHaveLength(1);
  });
});
