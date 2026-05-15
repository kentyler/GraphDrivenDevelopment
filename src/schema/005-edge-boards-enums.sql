-- Edge nodes & boards: enums (type-edge-node-status, type-board-status, type-board-impact, type-tension-character)

CREATE TYPE gdd.edge_node_status AS ENUM (
  'active',
  'expanded',
  'converted'
);

CREATE TYPE gdd.board_status AS ENUM (
  'active',
  'dormant',
  'superseded'
);

CREATE TYPE gdd.board_impact AS ENUM (
  'stable',
  'shifting',
  'reorganizing'
);

CREATE TYPE gdd.tension_character AS ENUM (
  'generative',
  'destabilizing',
  'expansionary'
);
