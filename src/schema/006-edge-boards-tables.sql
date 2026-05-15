-- Edge nodes & boards: tables (table-boards, table-edge-nodes, table-sensitivity-readings, table-tension-readings, table-expansion-events, table-conversion-events)

CREATE TABLE gdd.boards (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMP DEFAULT NOW(),
  created_by TEXT,
  statement TEXT,
  status gdd.board_status NOT NULL DEFAULT 'active'
);

CREATE TABLE gdd.edge_nodes (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES gdd.boards(id),
  created_at TIMESTAMP DEFAULT NOW(),
  created_by TEXT,
  name TEXT NOT NULL,
  content TEXT,
  related_nodes TEXT[],
  weight NUMERIC,
  status gdd.edge_node_status NOT NULL DEFAULT 'active',
  source_gap_id TEXT REFERENCES gdd.nodes(id)
);

CREATE TABLE gdd.sensitivity_readings (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  edge_node_id TEXT NOT NULL REFERENCES gdd.edge_nodes(id),
  read_at TIMESTAMP DEFAULT NOW(),
  read_by TEXT,
  signal TEXT,
  board_impact gdd.board_impact
);

CREATE TABLE gdd.tension_readings (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  board_id TEXT NOT NULL REFERENCES gdd.boards(id),
  read_at TIMESTAMP DEFAULT NOW(),
  read_by TEXT,
  signal TEXT,
  edge_node_id TEXT REFERENCES gdd.edge_nodes(id),
  tension_character gdd.tension_character
);

CREATE TABLE gdd.expansion_events (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  edge_node_id TEXT NOT NULL REFERENCES gdd.edge_nodes(id),
  occurred_at TIMESTAMP DEFAULT NOW(),
  description TEXT,
  new_gap_node_id TEXT REFERENCES gdd.nodes(id)
);

CREATE TABLE gdd.conversion_events (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  edge_node_id TEXT NOT NULL REFERENCES gdd.edge_nodes(id),
  occurred_at TIMESTAMP DEFAULT NOW(),
  description TEXT,
  original_gap_node_id TEXT REFERENCES gdd.nodes(id),
  failed_articulation_attempts TEXT[]
);

-- Add board_id to existing nodes table
ALTER TABLE gdd.nodes ADD COLUMN IF NOT EXISTS board_id TEXT REFERENCES gdd.boards(id);
