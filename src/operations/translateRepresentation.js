const { pool } = require('../db');
const { buildProjection } = require('./buildProjection');

// graph-to-human direction: deterministic
function graphToHuman(mutation) {
  if (!mutation || !mutation.type) return 'Graph mutation recorded.';

  const descriptions = {
    'create-intent': `Created intent "${mutation.name}" (${mutation.node_type || 'unknown type'})${mutation.test_condition ? ` — done when: ${mutation.test_condition}` : ''}`,
    'create-edge': `${mutation.from_node} now ${edgeDescription(mutation.edge_type)} ${mutation.to_node}`,
    'record-expression': `Recorded expression "${mutation.name}" satisfying ${(mutation.intent_ids || []).join(', ')}`,
    'create-gap': `Gap detected: "${mutation.name}" — ${mutation.notes || 'details pending'}`,
    'create-decision': `Decision made: "${mutation.name}" — ${mutation.notes || ''}`,
    'supersede': `"${mutation.new_intent_id}" supersedes "${mutation.old_intent_id}"`
  };

  return descriptions[mutation.type] || `Graph operation: ${mutation.type}`;
}

function edgeDescription(edgeType) {
  const map = {
    'blocked-by': 'depends on',
    'contains': 'contains',
    'tensions-with': 'is in tension with',
    'refines': 'refines',
    'supersedes': 'supersedes',
    'closes': 'resolves',
    'satisfies': 'satisfies'
  };
  return map[edgeType] || edgeType;
}

// human-to-graph direction: requires LLM
async function humanToGraph(input, { llm, context_intent_id } = {}) {
  if (!llm) {
    throw new Error('human-to-graph translation requires an llm function');
  }

  // Build context projection if available
  let projectionContext = '';
  if (context_intent_id) {
    try {
      const projection = await buildProjection(context_intent_id);
      projectionContext = `\nCurrent graph context (projection from ${context_intent_id}):\n${JSON.stringify(projection.nodes, null, 2).slice(0, 2000)}`;
    } catch (e) {
      // projection is optional context
    }
  }

  const prompt = `You are a graph-driven development system. Translate the following natural language input into graph operations.

Available operations:
- create-intent: { type, id, name, description, test_condition, test_verification, blocked_by[] }
- create-edge: { from_node, to_node, edge_type }
- create-gap: { id, name, notes }
- create-decision: { id, name, description, notes, closes[] }
- record-expression: { intent_ids[], name, description, artifacts }

Intent types: define-table, define-type, define-schema, implement-operation, implement-endpoint, implement-traversal, implement-projection, implement-mutation, integrate, derive, translate, constrain-permission, constrain-invariant, establish-convention, define-vocabulary

Edge types: blocked-by, contains, tensions-with, refines, supersedes, closes, satisfies

Rules:
- If the user can articulate what "done" looks like, create an intent with a test_condition.
- If the user cannot articulate a test condition, create a gap with notes recording what IS known.
- Generate meaningful IDs (kebab-case, descriptive).
- Return a JSON array of operations.
${projectionContext}

User input: "${input}"

Respond with ONLY a JSON array of operations:`;

  const response = await llm(prompt);

  // Parse LLM response
  let operations;
  try {
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('No JSON array in response');
    operations = JSON.parse(jsonMatch[0]);
  } catch (e) {
    // Transduction failure — create a gap preserving the original input
    return [{
      type: 'create-gap',
      id: `gap-translation-${Date.now()}`,
      name: 'Translation failed',
      notes: `Original input: "${input}"\nParse error: ${e.message}\nRaw LLM response: ${response.slice(0, 500)}`
    }];
  }

  // Validate operations
  const validated = [];
  for (const op of operations) {
    if (!op.type) continue;
    validated.push(op);
  }

  return validated.length > 0 ? validated : [{
    type: 'create-gap',
    id: `gap-empty-translation-${Date.now()}`,
    name: 'Translation produced no operations',
    notes: `Original input: "${input}"`
  }];
}

async function translateRepresentation(input, direction, options = {}) {
  if (direction === 'graph-to-human') {
    return graphToHuman(input);
  } else if (direction === 'human-to-graph') {
    return humanToGraph(input, options);
  } else {
    throw new Error("direction must be 'human-to-graph' or 'graph-to-human'");
  }
}

module.exports = { translateRepresentation, graphToHuman, humanToGraph };
