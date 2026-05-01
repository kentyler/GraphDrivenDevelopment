const { pool } = require('../db');
const { buildProjection } = require('./buildProjection');
const { createIntent } = require('./createIntent');
const { createGap } = require('./createGap');
const { createEdge } = require('./createEdge');
const { recordExpression } = require('./recordExpression');

async function getActiveLLM() {
  const result = await pool.query('SELECT * FROM gdd.llm_providers WHERE is_active = TRUE LIMIT 1');
  return result.rows[0] || null;
}

async function clientSession(input, { llm, client_id = 'anonymous', context_intent_id = null } = {}) {
  if (!input) throw new Error('input is required');

  if (!llm) {
    // Check for active provider
    const provider = await getActiveLLM();
    if (!provider) {
      const err = new Error('No active LLM provider configured. Natural language surfaces unavailable.');
      err.status = 501;
      throw err;
    }
    throw new Error('llm function is required for clientSession');
  }

  // Build context
  let contextStr = '';
  if (context_intent_id) {
    try {
      const proj = await buildProjection(context_intent_id);
      contextStr = `\nGraph context: ${JSON.stringify(proj.nodes, null, 2).slice(0, 2000)}`;
    } catch (e) { /* optional */ }
  }

  const prompt = `You are a graph-driven development system receiving natural language input from a client.
Your job: determine if the input expresses a clear intent (with a testable "done" condition) or something vague (which becomes a gap).

Rules:
- If the user can articulate what "done" looks like → create an intent with type, id, name, test_condition
- If not → create a gap with name and notes (recording what IS known)
- Generate kebab-case IDs
- Choose the most appropriate intent type from: define-table, define-type, define-schema, implement-operation, implement-endpoint, implement-traversal, implement-projection, implement-mutation, integrate, derive, translate, constrain-permission, constrain-invariant, establish-convention, define-vocabulary

${contextStr}

Client (${client_id}) says: "${input}"

Respond with ONLY a JSON object:
{ "classification": "intent" | "gap", "operations": [...] }

For intents: { "type": "create-intent", "id": "...", "node_type": "...", "name": "...", "description": "...", "test_condition": "...", "test_verification": "..." }
For gaps: { "type": "create-gap", "id": "...", "name": "...", "notes": "..." }`;

  const response = await llm(prompt);

  let parsed;
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');
    parsed = JSON.parse(jsonMatch[0]);
  } catch (e) {
    // Transduction failure → gap preserving input
    const gap = await createGap({
      name: 'Client intake translation failed',
      notes: `Original input: "${input}"\nClient: ${client_id}\nError: ${e.message}`
    });
    return { classification: 'gap', created: [gap] };
  }

  // Execute operations
  const created = [];
  const operations = parsed.operations || [parsed];

  for (const op of operations) {
    try {
      if (op.type === 'create-intent') {
        const node = await createIntent({
          id: op.id,
          type: op.node_type || 'implement-operation',
          name: op.name,
          description: op.description,
          test_condition: op.test_condition,
          test_verification: op.test_verification
        });
        created.push(node);
      } else if (op.type === 'create-gap') {
        const gap = await createGap({
          id: op.id,
          name: op.name,
          notes: op.notes || `From client ${client_id}: "${input}"`
        });
        created.push(gap);
      }
    } catch (e) {
      // Individual op failure → gap
      const gap = await createGap({
        name: `Failed to create: ${op.name || 'unnamed'}`,
        notes: `Operation: ${JSON.stringify(op)}\nError: ${e.message}\nOriginal input: "${input}"`
      });
      created.push(gap);
    }
  }

  return {
    classification: parsed.classification || (created[0]?.type === 'gap' ? 'gap' : 'intent'),
    created
  };
}

module.exports = { clientSession };
