-- Create database if it doesn't exist (must be run from another database like 'postgres')
-- CREATE DATABASE gdd;

-- Create schema
CREATE SCHEMA IF NOT EXISTS gdd;

-- Create ENUM types
DO $$ BEGIN
    CREATE TYPE gdd.intent_status AS ENUM ('potential', 'active', 'satisfied');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE gdd.edge_type AS ENUM ('blocked-by', 'contains', 'tensions-with', 'refines');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE gdd.session_status AS ENUM ('open', 'closed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE gdd.actor_type AS ENUM ('human', 'agent', 'client', 'external');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE gdd.agent_trust AS ENUM ('full', 'express-only', 'gaps-only');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE gdd.agent_status AS ENUM ('defined', 'active', 'paused');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create tables
CREATE TABLE IF NOT EXISTS gdd.nodes (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    status gdd.intent_status NOT NULL DEFAULT 'active',
    test_condition TEXT,
    test_verification TEXT,
    throughput NUMERIC,
    expression_artifacts TEXT[],
    expression_summary TEXT,
    created_by TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    session_id TEXT
);

CREATE TABLE IF NOT EXISTS gdd.edges (
    id SERIAL PRIMARY KEY,
    from_node TEXT NOT NULL REFERENCES gdd.nodes(id) ON DELETE CASCADE,
    to_node TEXT NOT NULL REFERENCES gdd.nodes(id) ON DELETE CASCADE,
    edge_type gdd.edge_type NOT NULL,
    metadata JSONB,
    UNIQUE(from_node, to_node, edge_type)
);

CREATE TABLE IF NOT EXISTS gdd.sessions (
    id TEXT PRIMARY KEY,
    intent_id TEXT REFERENCES gdd.nodes(id),
    actor_type gdd.actor_type NOT NULL,
    actor_id TEXT NOT NULL,
    status gdd.session_status NOT NULL DEFAULT 'open',
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP WITH TIME ZONE,
    parent_session_id TEXT REFERENCES gdd.sessions(id)
);

-- Circular reference: nodes table session_id should reference sessions table
-- Adding the FK after sessions table is created
ALTER TABLE gdd.nodes ADD CONSTRAINT fk_nodes_session FOREIGN KEY (session_id) REFERENCES gdd.sessions(id);

CREATE TABLE IF NOT EXISTS gdd.expressions (
    id SERIAL PRIMARY KEY,
    intent_id TEXT NOT NULL REFERENCES gdd.nodes(id),
    session_id TEXT NOT NULL REFERENCES gdd.sessions(id),
    artifacts TEXT[],
    summary TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    diff JSONB
);

CREATE TABLE IF NOT EXISTS gdd.mutations (
    id SERIAL PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES gdd.sessions(id),
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    before_state JSONB,
    after_state JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_mutations_session_id ON gdd.mutations(session_id);

CREATE TABLE IF NOT EXISTS gdd.agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    scope JSONB,
    trust_level gdd.agent_trust NOT NULL,
    trigger JSONB DEFAULT '{"type":"manual"}',
    status gdd.agent_status NOT NULL DEFAULT 'defined',
    current_session TEXT REFERENCES gdd.sessions(id),
    created_by TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    session_id TEXT REFERENCES gdd.sessions(id)
);

-- Insert root intent
INSERT INTO gdd.nodes (id, type, name, description, status, test_condition)
VALUES (
    'gdd-root',
    'compose',
    'GDD system exists and is operational',
    'The axiomatic ground of the intent graph. This intent exists before any session creates it. All bootstrap sessions reference it. The recursion of self-hosting bottoms out here.',
    'active',
    'Schema exists, API responds, graph is queryable'
) ON CONFLICT (id) DO NOTHING;
