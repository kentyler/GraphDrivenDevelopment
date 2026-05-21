const { pool } = require('../db');
const { loadPeers } = require('./peerDirectory');

async function receivePeerMessages() {
  const host = process.env.GDD_IMAP_HOST;
  if (!host) return { received: 0, reason: 'no IMAP config' };

  const imapSimple = require('imap-simple');
  const { simpleParser } = require('mailparser');

  const config = {
    imap: {
      user: process.env.GDD_IMAP_USER,
      password: process.env.GDD_IMAP_PASS,
      host,
      port: parseInt(process.env.GDD_IMAP_PORT || '993'),
      tls: true,
      authTimeout: 10000,
    },
  };

  const connection = await imapSimple.connect(config);
  await connection.openBox('INBOX');

  const messages = await connection.search(
    [['UNSEEN'], ['SUBJECT', 'GDD:']],
    { bodies: ['TEXT'], markSeen: true }
  );

  const peers = loadPeers();
  let received = 0;

  for (const msg of messages) {
    const rawText = msg.parts.find(p => p.which === 'TEXT');
    if (!rawText) continue;

    const parsed = await simpleParser(rawText.body);
    const subject = msg.attributes?.['x-gm-labels']
      ? parsed.subject
      : (parsed.subject || msg.attributes?.subject || '');

    // Extract message type from subject: GDD:<type>:<rest>
    const subjectStr = parsed.subject || '';
    const match = subjectStr.match(/^GDD:(broadcast|response|add-peer|remove-peer)/);
    if (!match) continue;

    const messageType = match[1];
    const fromAddress = parsed.from?.value?.[0]?.address || '';
    const peer = peers.find(p => p.email === fromAddress);
    const peerId = peer?.id || null;

    let body = (parsed.text || '').trim();
    let linkedMessageId = null;

    // For responses, try to extract broadcast_ref
    if (messageType === 'response') {
      try {
        const payload = JSON.parse(body);
        if (payload.broadcast_ref) {
          const ref = await pool.query(
            `SELECT id FROM gdd.peer_messages WHERE subject = $1 AND direction = 'sent' LIMIT 1`,
            [payload.broadcast_ref]
          );
          if (ref.rows.length > 0) linkedMessageId = ref.rows[0].id;
        }
      } catch (e) {
        // Body isn't JSON or no broadcast_ref - that's fine
      }
    }

    let intentIds = null;
    try {
      const payload = JSON.parse(body);
      if (payload.nodes) intentIds = payload.nodes.map(n => n.id);
      if (payload.matches) intentIds = payload.matches.map(m => m.id);
    } catch (e) {
      // Not JSON - no intent_ids
    }

    await pool.query(`
      INSERT INTO gdd.peer_messages (direction, message_type, peer_id, subject, content, linked_message_id, intent_ids)
      VALUES ('received', $1, $2, $3, $4, $5, $6)
    `, [messageType, peerId, subjectStr, body, linkedMessageId, intentIds]);

    received++;
  }

  connection.end();
  return { received };
}

module.exports = { receivePeerMessages };
