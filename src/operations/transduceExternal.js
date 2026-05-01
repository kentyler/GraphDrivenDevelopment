const { pool } = require('../db');
const { createIntent } = require('./createIntent');
const { createGap } = require('./createGap');
const { createEdge } = require('./createEdge');
const { buildProjection } = require('./buildProjection');

async function transduceExternal(event_description, { llm, interpreter = 'system', id_prefix = null, context_intent_id = null } = {}) {
  if (!event_description) throw new Error('event_description is required');

  // Step 1: Create signal node recording the raw event
  const signalId = id_prefix ? `${id_prefix}-signal` : `transduction-${Date.now()}`;
  await pool.query(`
    INSERT INTO gdd.nodes (id, type, name, description, notes)
    VALUES ($1, 'signal', $2, $3, $4)
  `, [signalId, `External event: ${event_description.slice(0, 80)}`, event_description, `Source: external\nInterpreter: ${interpreter}\nTimestamp: ${new Date().toISOString()}\n\n${event_description}`]);

  const result = { signal_id: signalId, operational_elements: [] };

  if (!llm) {
    // Without LLM, just record the signal — transduction deferred
    return result;
  }

  // Step 2: LLM interprets the signal into operational elements
  let contextStr = '';
  if (context_intent_id) {
    try {
      const proj = await buildProjection(context_intent_id);
      contextStr = `\nRelevant graph context: ${JSON.stringify(proj.nodes, null, 2).slice(0, 2000)}`;
    } catch (e) { /* optional */ }
  }

  const prompt = `You are a graph-driven development system. An external event has occurred and needs to be interpreted into operational graph elements.

Event: "${event_description}"
${contextStr}

Determine what intents (with testable conditions) or gaps (where impact is unclear) this event creates.

Respond with ONLY a JSON array of operations:
[
  { "type": "create-intent", "id": "...", "node_type": "...", "name": "...", "description": "...", "test_condition": "...", "test_verification": "..." }
  OR
  { "type": "create-gap", "id": "...", "name": "...", "notes": "..." }
]`;

  let operations;
  try {
    const response = await llm(prompt);
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('No JSON array in response');
    operations = JSON.parse(jsonMatch[0]);
  } catch (e) {
    // Transduction failure — create a gap preserving the event
    const gap = await createGap({
      id: id_prefix ? `${id_prefix}-gap` : undefined,
      name: `Cannot interpret external event`,
      notes: `Event: "${event_description}"\nError: ${e.message}`
    });
    await createEdge({ from_node: gap.id, to_node: signalId, edge_type: 'blocked-by' });
    result.operational_elements.push(gap);
    return result;
  }

  // Step 3: Execute operations and link back to signal
  for (const op of operations) {
    try {
      let node;
      if (op.type === 'create-intent') {
        node = await createIntent({
          id: op.id,
          type: op.node_type || 'implement-operation',
          name: op.name,
          description: op.description,
          test_condition: op.test_condition,
          test_verification: op.test_verification
        });
      } else if (op.type === 'create-gap') {
        node = await createGap({
          id: op.id,
          name: op.name,
          notes: op.notes
        });
      }

      if (node) {
        // Link operational element back to signal
        await createEdge({ from_node: node.id, to_node: signalId, edge_type: 'blocked-by' });
        result.operational_elements.push(node);
      }
    } catch (e) {
      // Individual failure → gap
      const gap = await createGap({
        name: `Failed: ${op.name || 'unnamed'}`,
        notes: `Op: ${JSON.stringify(op)}\nError: ${e.message}`
      });
      await createEdge({ from_node: gap.id, to_node: signalId, edge_type: 'blocked-by' });
      result.operational_elements.push(gap);
    }
  }

  return result;
}

module.exports = { transduceExternal };
