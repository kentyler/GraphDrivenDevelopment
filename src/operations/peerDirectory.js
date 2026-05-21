const fs = require('fs');
const path = require('path');

const PEERS_FILE = path.join(process.cwd(), 'peers.json');

function loadPeers() {
  try {
    return JSON.parse(fs.readFileSync(PEERS_FILE, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
}

function savePeers(peers) {
  fs.writeFileSync(PEERS_FILE, JSON.stringify(peers, null, 2));
}

function addPeer({ id, name, email }) {
  if (!id || !name || !email) throw new Error('id, name, and email are required');
  const peers = loadPeers();
  if (peers.find(p => p.id === id)) throw new Error(`Peer '${id}' already exists`);
  peers.push({ id, name, email });
  savePeers(peers);
  return { id, name, email };
}

function removePeer(peer_id) {
  if (!peer_id) throw new Error('peer_id is required');
  const peers = loadPeers();
  const idx = peers.findIndex(p => p.id === peer_id);
  if (idx === -1) throw new Error(`Peer '${peer_id}' not found`);
  const removed = peers.splice(idx, 1)[0];
  savePeers(peers);
  return removed;
}

function listPeers() {
  return loadPeers();
}

module.exports = { loadPeers, savePeers, addPeer, removePeer, listPeers, PEERS_FILE };
