-- P2P peer messaging for sovereign GDD instances
CREATE TYPE gdd.peer_message_direction AS ENUM ('sent', 'received');
CREATE TYPE gdd.peer_message_type AS ENUM ('broadcast', 'response', 'add-peer', 'remove-peer');

CREATE TABLE gdd.peer_messages (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  direction gdd.peer_message_direction NOT NULL,
  message_type gdd.peer_message_type NOT NULL,
  peer_id TEXT,
  subject TEXT NOT NULL,
  content TEXT,
  linked_message_id TEXT REFERENCES gdd.peer_messages(id),
  intent_ids TEXT[],
  created_at TIMESTAMP DEFAULT NOW()
);
