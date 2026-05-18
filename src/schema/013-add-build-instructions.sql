-- Migration: add build_instructions column to gdd.nodes
-- Self-hosting: each intent carries its own build instructions so a new install
-- can be driven entirely from the graph.
ALTER TABLE gdd.nodes ADD COLUMN IF NOT EXISTS build_instructions TEXT;
