const nodemailer = require('nodemailer');
const { pool } = require('../db');
const { loadPeers } = require('./peerDirectory');
const { queryIncomplete } = require('./queryIncomplete');

function createTransport() {
  const host = process.env.GDD_SMTP_HOST;
  if (!host) return null;
  return nodemailer.createTransport({
    host,
    port: parseInt(process.env.GDD_SMTP_PORT || '587'),
    secure: parseInt(process.env.GDD_SMTP_PORT || '587') === 465,
    auth: {
      user: process.env.GDD_SMTP_USER,
      pass: process.env.GDD_SMTP_PASS,
    },
  });
}

async function broadcastRedNodes({ graph_id } = {}) {
  const peers = loadPeers();
  if (peers.length === 0) return { sent: 0, reason: 'no peers' };

  const transport = createTransport();
  if (!transport) return { sent: 0, reason: 'no SMTP config' };

  const redNodes = await queryIncomplete({ workable: true, graph_id });
  if (redNodes.length === 0) return { sent: 0, reason: 'no red nodes' };

  // Abstract: only share what a peer needs to help
  const descriptions = redNodes.map(n => ({
    id: n.id,
    name: n.name,
    description: n.description,
    test_condition: n.test_condition,
  }));

  const timestamp = new Date().toISOString();
  const subject = `GDD:broadcast:${timestamp}`;
  const body = JSON.stringify({ type: 'broadcast', timestamp, nodes: descriptions });
  const from = process.env.GDD_SMTP_FROM || process.env.GDD_SMTP_USER;
  const intentIds = descriptions.map(d => d.id);

  let sent = 0;
  for (const peer of peers) {
    await transport.sendMail({
      from,
      to: peer.email,
      subject,
      text: body,
    });

    await pool.query(`
      INSERT INTO gdd.peer_messages (direction, message_type, peer_id, subject, content, intent_ids)
      VALUES ('sent', 'broadcast', $1, $2, $3, $4)
    `, [peer.id, subject, body, intentIds]);

    sent++;
  }

  return { sent, nodes: descriptions.length, peers: peers.length };
}

module.exports = { broadcastRedNodes, createTransport };
