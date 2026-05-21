-- Populate peer messaging intents in the live GDD graph
BEGIN;

-- Insert peer messaging nodes
INSERT INTO gdd.nodes (id, type, name, description, test_condition, test_verification, build_instructions) VALUES
('peer-messaging', 'compose', 'P2P peer messaging', 'Sovereign GDD instances exchange structured messages about unsatisfied intents via email. No shared graph, no central server. Intelligence at the edges, dumb transport in the middle.', NULL, NULL, NULL)
ON CONFLICT (id) DO UPDATE SET build_instructions = EXCLUDED.build_instructions;

INSERT INTO gdd.nodes (id, type, name, description, test_condition, test_verification, build_instructions) VALUES
('type-peer-message-direction', 'define-type', 'Peer message direction enum', 'Direction of a peer message: sent or received.', 'Enum gdd.peer_message_direction exists with values: sent, received.', 'SELECT enumlabel FROM pg_enum WHERE enumtypid = ''gdd.peer_message_direction''::regtype', 'CREATE TYPE gdd.peer_message_direction AS ENUM (''sent'', ''received'').')
ON CONFLICT (id) DO UPDATE SET build_instructions = EXCLUDED.build_instructions;

INSERT INTO gdd.nodes (id, type, name, description, test_condition, test_verification, build_instructions) VALUES
('type-peer-message-type', 'define-type', 'Peer message type enum', 'Type of peer message: broadcast, response, add-peer, remove-peer.', 'Enum gdd.peer_message_type exists with values: broadcast, response, add-peer, remove-peer.', 'SELECT enumlabel FROM pg_enum WHERE enumtypid = ''gdd.peer_message_type''::regtype', 'CREATE TYPE gdd.peer_message_type AS ENUM (''broadcast'', ''response'', ''add-peer'', ''remove-peer'').')
ON CONFLICT (id) DO UPDATE SET build_instructions = EXCLUDED.build_instructions;

INSERT INTO gdd.nodes (id, type, name, description, test_condition, test_verification, build_instructions) VALUES
('table-peer-messages', 'define-table', 'Peer messages table', 'Stores sent and received peer messages with direction, type, peer reference, and optional linkage to original broadcasts.', 'Table gdd.peer_messages exists with columns: id, direction, message_type, peer_id, subject, content, linked_message_id, intent_ids, created_at.', 'SELECT * FROM information_schema.columns WHERE table_schema=''gdd'' AND table_name=''peer_messages''', 'CREATE TABLE gdd.peer_messages with columns: id (TEXT PK, default gen_random_uuid()::text), direction (gdd.peer_message_direction NOT NULL), message_type (gdd.peer_message_type NOT NULL), peer_id (TEXT), subject (TEXT NOT NULL), content (TEXT), linked_message_id (TEXT FK to gdd.peer_messages), intent_ids (TEXT[]), created_at (TIMESTAMP DEFAULT NOW()). Self-referential FK for linked_message_id enables response-to-broadcast linking.')
ON CONFLICT (id) DO UPDATE SET build_instructions = EXCLUDED.build_instructions;

INSERT INTO gdd.nodes (id, type, name, description, test_condition, test_verification, build_instructions) VALUES
('op-peer-directory', 'implement-operation', 'Peer directory', 'CRUD operations for the peer directory stored as peers.json at project root.', 'Can add, list, and remove peers. Missing file returns empty array. Duplicate peer id rejected.', 'Integration test with temp file: add peers, list, remove, verify.', 'Implement loadPeers(), savePeers(peers), addPeer({id, name, email}), removePeer(peer_id), listPeers() that manage a peers.json file at project root. Handle ENOENT (missing file = empty array = P2P disabled). Validate id/name/email required for addPeer. Reject duplicate peer ids. Add peers.json to .gitignore.')
ON CONFLICT (id) DO UPDATE SET build_instructions = EXCLUDED.build_instructions;

INSERT INTO gdd.nodes (id, type, name, description, test_condition, test_verification, build_instructions) VALUES
('op-broadcast-red-nodes', 'implement-operation', 'Broadcast red nodes to peers', 'Send workable red intents to all peers via email. Abstracted descriptions only -- no edges or graph topology.', 'Returns {sent:0} with no peers. Returns {sent:0} with no red nodes. With peers and red nodes, sends emails and records in peer_messages.', 'Integration test: no peers returns 0, no red nodes returns 0. Email transport mocked for send test.', 'Implement broadcastRedNodes({graph_id}) that sends workable red nodes to all peers via email. Steps: (1) loadPeers() -- return {sent:0} if empty, (2) create nodemailer transport from GDD_SMTP_* env vars -- return {sent:0} if no config, (3) queryIncomplete({workable:true, graph_id}) -- return {sent:0} if no red nodes, (4) abstract each node to {id, name, description, test_condition} -- no edges or topology, (5) send email to each peer with subject GDD:broadcast:<timestamp> and JSON body, (6) record each sent message in gdd.peer_messages. Dependencies: nodemailer, peerDirectory, queryIncomplete.')
ON CONFLICT (id) DO UPDATE SET build_instructions = EXCLUDED.build_instructions;

INSERT INTO gdd.nodes (id, type, name, description, test_condition, test_verification, build_instructions) VALUES
('op-receive-peer-messages', 'implement-operation', 'Receive peer messages via IMAP', 'Fetch unseen GDD: emails via IMAP, parse, and record in peer_messages table.', 'Returns {received:0} with no IMAP config. Parses GDD: subject correctly. Links responses to original broadcasts.', 'Integration test: no IMAP returns 0. Email parsing mocked for receive test.', 'Implement receivePeerMessages() that fetches unseen GDD: emails via IMAP. Steps: (1) return {received:0} if no GDD_IMAP_HOST, (2) connect via imap-simple with GDD_IMAP_* config, (3) search UNSEEN with subject GDD:, markSeen, (4) parse each: extract message type from subject (GDD:broadcast|response|add-peer|remove-peer), match FROM to peer directory, (5) for responses: extract broadcast_ref from JSON body and link to original sent message, (6) insert into gdd.peer_messages. Dependencies: imap-simple, mailparser, peerDirectory.')
ON CONFLICT (id) DO UPDATE SET build_instructions = EXCLUDED.build_instructions;

INSERT INTO gdd.nodes (id, type, name, description, test_condition, test_verification, build_instructions) VALUES
('op-respond-to-peer-broadcast', 'implement-operation', 'Respond to peer broadcast', 'Search local graph for green nodes matching a received broadcast and reply with descriptions.', 'Responds with matching green nodes. Links response to broadcast. Returns {sent:false} if no matches or peer not found.', 'Integration test: create broadcast message, search with known green nodes, verify response linkage.', 'Implement respondToPeerBroadcast(messageId) that responds to a received broadcast with matching local green nodes. Steps: (1) fetch broadcast from gdd.peer_messages, (2) parse red node descriptions from content, (3) search local graph for green nodes (have satisfies edge) with similar names/descriptions via LIKE match, (4) compose response JSON with matches, (5) send email to peer with subject GDD:response:<timestamp> and broadcast_ref in body, (6) record sent response in peer_messages linked to broadcast. Dependencies: nodemailer (via createTransport from broadcastRedNodes), peerDirectory.')
ON CONFLICT (id) DO UPDATE SET build_instructions = EXCLUDED.build_instructions;

-- Edges: gdd-root contains peer-messaging
INSERT INTO gdd.edges (from_node, to_node, edge_type) SELECT 'gdd-root', 'peer-messaging', 'contains' WHERE NOT EXISTS (SELECT 1 FROM gdd.edges WHERE from_node = 'gdd-root' AND to_node = 'peer-messaging' AND edge_type = 'contains' AND superseded_by IS NULL);

-- peer-messaging contains children
INSERT INTO gdd.edges (from_node, to_node, edge_type) SELECT 'peer-messaging', 'type-peer-message-direction', 'contains' WHERE NOT EXISTS (SELECT 1 FROM gdd.edges WHERE from_node = 'peer-messaging' AND to_node = 'type-peer-message-direction' AND edge_type = 'contains' AND superseded_by IS NULL);
INSERT INTO gdd.edges (from_node, to_node, edge_type) SELECT 'peer-messaging', 'type-peer-message-type', 'contains' WHERE NOT EXISTS (SELECT 1 FROM gdd.edges WHERE from_node = 'peer-messaging' AND to_node = 'type-peer-message-type' AND edge_type = 'contains' AND superseded_by IS NULL);
INSERT INTO gdd.edges (from_node, to_node, edge_type) SELECT 'peer-messaging', 'table-peer-messages', 'contains' WHERE NOT EXISTS (SELECT 1 FROM gdd.edges WHERE from_node = 'peer-messaging' AND to_node = 'table-peer-messages' AND edge_type = 'contains' AND superseded_by IS NULL);
INSERT INTO gdd.edges (from_node, to_node, edge_type) SELECT 'peer-messaging', 'op-peer-directory', 'contains' WHERE NOT EXISTS (SELECT 1 FROM gdd.edges WHERE from_node = 'peer-messaging' AND to_node = 'op-peer-directory' AND edge_type = 'contains' AND superseded_by IS NULL);
INSERT INTO gdd.edges (from_node, to_node, edge_type) SELECT 'peer-messaging', 'op-broadcast-red-nodes', 'contains' WHERE NOT EXISTS (SELECT 1 FROM gdd.edges WHERE from_node = 'peer-messaging' AND to_node = 'op-broadcast-red-nodes' AND edge_type = 'contains' AND superseded_by IS NULL);
INSERT INTO gdd.edges (from_node, to_node, edge_type) SELECT 'peer-messaging', 'op-receive-peer-messages', 'contains' WHERE NOT EXISTS (SELECT 1 FROM gdd.edges WHERE from_node = 'peer-messaging' AND to_node = 'op-receive-peer-messages' AND edge_type = 'contains' AND superseded_by IS NULL);
INSERT INTO gdd.edges (from_node, to_node, edge_type) SELECT 'peer-messaging', 'op-respond-to-peer-broadcast', 'contains' WHERE NOT EXISTS (SELECT 1 FROM gdd.edges WHERE from_node = 'peer-messaging' AND to_node = 'op-respond-to-peer-broadcast' AND edge_type = 'contains' AND superseded_by IS NULL);

-- Enums blocked by foundation
INSERT INTO gdd.edges (from_node, to_node, edge_type) SELECT 'type-peer-message-direction', 'foundation-tables', 'blocked-by' WHERE NOT EXISTS (SELECT 1 FROM gdd.edges WHERE from_node = 'type-peer-message-direction' AND to_node = 'foundation-tables' AND edge_type = 'blocked-by' AND superseded_by IS NULL);
INSERT INTO gdd.edges (from_node, to_node, edge_type) SELECT 'type-peer-message-type', 'foundation-tables', 'blocked-by' WHERE NOT EXISTS (SELECT 1 FROM gdd.edges WHERE from_node = 'type-peer-message-type' AND to_node = 'foundation-tables' AND edge_type = 'blocked-by' AND superseded_by IS NULL);

-- Table blocked by enums
INSERT INTO gdd.edges (from_node, to_node, edge_type) SELECT 'table-peer-messages', 'type-peer-message-direction', 'blocked-by' WHERE NOT EXISTS (SELECT 1 FROM gdd.edges WHERE from_node = 'table-peer-messages' AND to_node = 'type-peer-message-direction' AND edge_type = 'blocked-by' AND superseded_by IS NULL);
INSERT INTO gdd.edges (from_node, to_node, edge_type) SELECT 'table-peer-messages', 'type-peer-message-type', 'blocked-by' WHERE NOT EXISTS (SELECT 1 FROM gdd.edges WHERE from_node = 'table-peer-messages' AND to_node = 'type-peer-message-type' AND edge_type = 'blocked-by' AND superseded_by IS NULL);

-- Operation dependencies
INSERT INTO gdd.edges (from_node, to_node, edge_type) SELECT 'op-broadcast-red-nodes', 'table-peer-messages', 'blocked-by' WHERE NOT EXISTS (SELECT 1 FROM gdd.edges WHERE from_node = 'op-broadcast-red-nodes' AND to_node = 'table-peer-messages' AND edge_type = 'blocked-by' AND superseded_by IS NULL);
INSERT INTO gdd.edges (from_node, to_node, edge_type) SELECT 'op-broadcast-red-nodes', 'op-peer-directory', 'blocked-by' WHERE NOT EXISTS (SELECT 1 FROM gdd.edges WHERE from_node = 'op-broadcast-red-nodes' AND to_node = 'op-peer-directory' AND edge_type = 'blocked-by' AND superseded_by IS NULL);
INSERT INTO gdd.edges (from_node, to_node, edge_type) SELECT 'op-broadcast-red-nodes', 'op-query-incomplete', 'blocked-by' WHERE NOT EXISTS (SELECT 1 FROM gdd.edges WHERE from_node = 'op-broadcast-red-nodes' AND to_node = 'op-query-incomplete' AND edge_type = 'blocked-by' AND superseded_by IS NULL);
INSERT INTO gdd.edges (from_node, to_node, edge_type) SELECT 'op-receive-peer-messages', 'table-peer-messages', 'blocked-by' WHERE NOT EXISTS (SELECT 1 FROM gdd.edges WHERE from_node = 'op-receive-peer-messages' AND to_node = 'table-peer-messages' AND edge_type = 'blocked-by' AND superseded_by IS NULL);
INSERT INTO gdd.edges (from_node, to_node, edge_type) SELECT 'op-receive-peer-messages', 'op-peer-directory', 'blocked-by' WHERE NOT EXISTS (SELECT 1 FROM gdd.edges WHERE from_node = 'op-receive-peer-messages' AND to_node = 'op-peer-directory' AND edge_type = 'blocked-by' AND superseded_by IS NULL);
INSERT INTO gdd.edges (from_node, to_node, edge_type) SELECT 'op-respond-to-peer-broadcast', 'table-peer-messages', 'blocked-by' WHERE NOT EXISTS (SELECT 1 FROM gdd.edges WHERE from_node = 'op-respond-to-peer-broadcast' AND to_node = 'table-peer-messages' AND edge_type = 'blocked-by' AND superseded_by IS NULL);
INSERT INTO gdd.edges (from_node, to_node, edge_type) SELECT 'op-respond-to-peer-broadcast', 'op-peer-directory', 'blocked-by' WHERE NOT EXISTS (SELECT 1 FROM gdd.edges WHERE from_node = 'op-respond-to-peer-broadcast' AND to_node = 'op-peer-directory' AND edge_type = 'blocked-by' AND superseded_by IS NULL);
INSERT INTO gdd.edges (from_node, to_node, edge_type) SELECT 'op-respond-to-peer-broadcast', 'op-broadcast-red-nodes', 'blocked-by' WHERE NOT EXISTS (SELECT 1 FROM gdd.edges WHERE from_node = 'op-respond-to-peer-broadcast' AND to_node = 'op-broadcast-red-nodes' AND edge_type = 'blocked-by' AND superseded_by IS NULL);

-- MCP tools blocked by peer operations
INSERT INTO gdd.edges (from_node, to_node, edge_type) SELECT 'mcp-tools', 'op-peer-directory', 'blocked-by' WHERE NOT EXISTS (SELECT 1 FROM gdd.edges WHERE from_node = 'mcp-tools' AND to_node = 'op-peer-directory' AND edge_type = 'blocked-by' AND superseded_by IS NULL);
INSERT INTO gdd.edges (from_node, to_node, edge_type) SELECT 'mcp-tools', 'op-broadcast-red-nodes', 'blocked-by' WHERE NOT EXISTS (SELECT 1 FROM gdd.edges WHERE from_node = 'mcp-tools' AND to_node = 'op-broadcast-red-nodes' AND edge_type = 'blocked-by' AND superseded_by IS NULL);
INSERT INTO gdd.edges (from_node, to_node, edge_type) SELECT 'mcp-tools', 'op-receive-peer-messages', 'blocked-by' WHERE NOT EXISTS (SELECT 1 FROM gdd.edges WHERE from_node = 'mcp-tools' AND to_node = 'op-receive-peer-messages' AND edge_type = 'blocked-by' AND superseded_by IS NULL);
INSERT INTO gdd.edges (from_node, to_node, edge_type) SELECT 'mcp-tools', 'op-respond-to-peer-broadcast', 'blocked-by' WHERE NOT EXISTS (SELECT 1 FROM gdd.edges WHERE from_node = 'mcp-tools' AND to_node = 'op-respond-to-peer-broadcast' AND edge_type = 'blocked-by' AND superseded_by IS NULL);

-- Bootstrap expression for DDL intents already satisfied by migration
INSERT INTO gdd.nodes (id, type, name, description, artifacts)
VALUES ('expression-bootstrap-peer-schema', 'expression', 'Peer messaging schema bootstrap', 'Bootstrap created peer message enums and table via SQL migration.', '{"files":["015-peer-messages.sql"]}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO gdd.edges (from_node, to_node, edge_type) SELECT 'expression-bootstrap-peer-schema', 'type-peer-message-direction', 'satisfies' WHERE NOT EXISTS (SELECT 1 FROM gdd.edges WHERE from_node = 'expression-bootstrap-peer-schema' AND to_node = 'type-peer-message-direction' AND edge_type = 'satisfies' AND superseded_by IS NULL);
INSERT INTO gdd.edges (from_node, to_node, edge_type) SELECT 'expression-bootstrap-peer-schema', 'type-peer-message-type', 'satisfies' WHERE NOT EXISTS (SELECT 1 FROM gdd.edges WHERE from_node = 'expression-bootstrap-peer-schema' AND to_node = 'type-peer-message-type' AND edge_type = 'satisfies' AND superseded_by IS NULL);
INSERT INTO gdd.edges (from_node, to_node, edge_type) SELECT 'expression-bootstrap-peer-schema', 'table-peer-messages', 'satisfies' WHERE NOT EXISTS (SELECT 1 FROM gdd.edges WHERE from_node = 'expression-bootstrap-peer-schema' AND to_node = 'table-peer-messages' AND edge_type = 'satisfies' AND superseded_by IS NULL);

-- Add to gdd-system graph
INSERT INTO gdd.graph_memberships (graph_id, node_id) VALUES
('gdd-system', 'peer-messaging'),
('gdd-system', 'type-peer-message-direction'),
('gdd-system', 'type-peer-message-type'),
('gdd-system', 'table-peer-messages'),
('gdd-system', 'op-peer-directory'),
('gdd-system', 'op-broadcast-red-nodes'),
('gdd-system', 'op-receive-peer-messages'),
('gdd-system', 'op-respond-to-peer-broadcast')
ON CONFLICT (graph_id, node_id) DO NOTHING;

-- Update mcp-tools build_instructions
UPDATE gdd.nodes SET build_instructions = 'Register all core graph operations as MCP tools using server.tool(name, zodSchema, handler). Tools: query_incomplete, build_projection, create_intent, record_expression, link_expression, set_test_condition, query_unlinked, create_gap, create_decision, supersede_intent, supersede_edge, create_edge, query_skills, query_agents, ask, configure_provider, create_graph, add_node_to_graph, remove_node_from_graph, query_graph_nodes, node_graphs. Peer tools: list_peers, add_peer (id/name/email), remove_peer (peer_id), broadcast_red_nodes (graph_id optional), check_peer_messages, respond_to_broadcast (message_id), view_peer_messages (direction/message_type/peer_id optional filters). Each tool calls the existing operation function -- no new logic, just protocol translation. Use zod for input schemas.'
WHERE id = 'mcp-tools';

COMMIT;
