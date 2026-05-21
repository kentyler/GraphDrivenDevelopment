const nodemailer = require('nodemailer');
const { pool } = require('../db');
const { loadPeers } = require('./peerDirectory');
const { createTransport } = require('./broadcastRedNodes');

async function respondToPeerBroadcast(messageId) {
  if (!messageId) throw new Error('messageId is required');

  // Fetch the incoming broadcast
  const msg = await pool.query(
    `SELECT * FROM gdd.peer_messages WHERE id = $1 AND direction = 'received'`,
    [messageId]
  );
  if (msg.rows.length === 0) throw new Error(`Message '${messageId}' not found or not a received message`);

  const broadcast = msg.rows[0];
  let requestedNodes;
  try {
    const payload = JSON.parse(broadcast.content);
    requestedNodes = payload.nodes || [];
  } catch (e) {
    throw new Error('Could not parse broadcast content');
  }

  if (requestedNodes.length === 0) return { sent: false, reason: 'no nodes in broadcast' };

  // Search local graph for green nodes with similar names/descriptions
  const matches = [];
  for (const requested of requestedNodes) {
    const result = await pool.query(`
      SELECT n.id, n.name, n.description, n.test_condition
      FROM gdd.nodes n
      WHERE EXISTS (SELECT 1 FROM gdd.edges e WHERE e.to_node = n.id AND e.edge_type = 'satisfies')
        AND (
          LOWER(n.name) LIKE $1
          OR LOWER(n.description) LIKE $1
        )
    `, [`%${(requested.name || '').toLowerCase()}%`]);

    if (result.rows.length > 0) {
      matches.push({
        requested_id: requested.id,
        requested_name: requested.name,
        local_matches: result.rows.map(r => ({
          id: r.id,
          name: r.name,
          description: r.description,
          test_condition: r.test_condition,
        })),
      });
    }
  }

  if (matches.length === 0) return { sent: false, reason: 'no matching green nodes found' };

  // Find the peer to respond to
  const peer = loadPeers().find(p => p.id === broadcast.peer_id);
  if (!peer) return { sent: false, reason: 'peer not found in directory' };

  const transport = createTransport();
  if (!transport) return { sent: false, reason: 'no SMTP config' };

  const timestamp = new Date().toISOString();
  const subject = `GDD:response:${timestamp}`;
  const body = JSON.stringify({
    type: 'response',
    broadcast_ref: broadcast.subject,
    timestamp,
    matches,
  });

  const from = process.env.GDD_SMTP_FROM || process.env.GDD_SMTP_USER;
  await transport.sendMail({ from, to: peer.email, subject, text: body });

  await pool.query(`
    INSERT INTO gdd.peer_messages (direction, message_type, peer_id, subject, content, linked_message_id, intent_ids)
    VALUES ('sent', 'response', $1, $2, $3, $4, $5)
  `, [
    peer.id,
    subject,
    body,
    broadcast.id,
    matches.map(m => m.requested_id),
  ]);

  return { sent: true, matches: matches.length, peer: peer.id };
}

module.exports = { respondToPeerBroadcast };
