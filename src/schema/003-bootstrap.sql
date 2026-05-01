-- The root intent: axiomatic ground, inserted before graph operations exist.
INSERT INTO gdd.nodes (id, type, name, description, test_condition, test_verification)
VALUES (
  'gdd-root',
  'compose',
  'GDD system exists and is operational',
  'The axiomatic ground of the intent graph. This intent exists before any graph operation creates it. The recursion of self-hosting bottoms out here.',
  NULL,
  NULL
);
