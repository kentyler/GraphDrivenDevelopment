-- Layer 0: Core tables (table-nodes, table-edges, table-graphs, table-graph-memberships, table-agents, table-skills, table-llm-providers)

-- No created_at on nodes or edges -- history is topology, not timestamps.
CREATE TABLE gdd.nodes (
  id TEXT PRIMARY KEY,
  type gdd.node_type NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  test_condition TEXT,
  test_verification TEXT,
  notes TEXT,
  artifacts JSONB,
  build_instructions TEXT
);

CREATE TABLE gdd.edges (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  from_node TEXT NOT NULL REFERENCES gdd.nodes(id),
  to_node TEXT NOT NULL REFERENCES gdd.nodes(id),
  edge_type gdd.edge_type NOT NULL,
  description TEXT,
  created_by TEXT,
  superseded_by TEXT REFERENCES gdd.edges(id)
);

CREATE TABLE gdd.graphs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE gdd.graph_memberships (
  graph_id TEXT NOT NULL REFERENCES gdd.graphs(id),
  node_id TEXT NOT NULL REFERENCES gdd.nodes(id),
  UNIQUE(graph_id, node_id)
);

CREATE TABLE gdd.agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  scope JSONB,
  trust_level gdd.agent_trust NOT NULL DEFAULT 'gaps-only',
  trigger JSONB DEFAULT '{"type":"manual"}',
  status gdd.agent_status NOT NULL DEFAULT 'defined',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE gdd.skills (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  description TEXT,
  file_path TEXT,
  endpoint TEXT,
  category TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE gdd.llm_providers (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  provider TEXT NOT NULL,
  api_key TEXT NOT NULL,
  model TEXT,
  is_active BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);
