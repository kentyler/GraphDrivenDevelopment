-- Layer 0: Enums (type-node-type, type-edge-type, type-agent-trust, type-agent-status)

CREATE TYPE gdd.node_type AS ENUM (
  'define-table',
  'define-type',
  'define-schema',
  'implement-operation',
  'implement-endpoint',
  'implement-traversal',
  'implement-projection',
  'implement-mutation',
  'integrate',
  'derive',
  'translate',
  'constrain-permission',
  'constrain-invariant',
  'establish-convention',
  'define-vocabulary',
  'compose',
  'gap',
  'decision',
  'signal',
  'expression',
  'axiom'
);

CREATE TYPE gdd.edge_type AS ENUM (
  'blocked-by',
  'contains',
  'tensions-with',
  'refines',
  'supersedes',
  'closes',
  'satisfies'
);

CREATE TYPE gdd.agent_trust AS ENUM (
  'full',
  'express-only',
  'gaps-only'
);

CREATE TYPE gdd.agent_status AS ENUM (
  'defined',
  'active',
  'paused'
);
