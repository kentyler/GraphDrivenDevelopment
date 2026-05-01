const { pool } = require('../db');
const { queryIncomplete } = require('./queryIncomplete');
const { buildProjection } = require('./buildProjection');
const { renderLLM } = require('./renderLLM');
const { recordExpression } = require('./recordExpression');
const { createGap } = require('./createGap');

async function activateAgent(agentId, { llm } = {}) {
  if (!agentId) throw new Error('agentId is required');

  // Get agent definition
  const agentResult = await pool.query('SELECT * FROM gdd.agents WHERE id = $1', [agentId]);
  if (agentResult.rows.length === 0) throw new Error(`Agent '${agentId}' does not exist`);
  const agent = agentResult.rows[0];

  // Set status to active
  await pool.query("UPDATE gdd.agents SET status = 'active' WHERE id = $1", [agentId]);

  const scope = typeof agent.scope === 'string' ? JSON.parse(agent.scope) : agent.scope;
  const scopeIntentIds = scope.intent_ids || [];

  // Find red intents within scope
  const allIncomplete = await queryIncomplete({ workable: true });
  const inScope = allIncomplete.filter(n => scopeIntentIds.includes(n.id));

  const results = [];

  for (const intent of inScope) {
    // Trust level check
    if (agent.trust_level === 'gaps-only') {
      // Can only create gaps
      const gap = await createGap({
        name: `Agent ${agentId} examined: ${intent.name}`,
        notes: `Agent with gaps-only trust encountered red intent ${intent.id}. Requires higher trust to express.`
      });
      results.push({ action: 'gap-created', intent_id: intent.id, gap_id: gap.id });
      continue;
    }

    if (!llm) {
      // Without LLM, create a gap
      const gap = await createGap({
        name: `Agent ${agentId} needs LLM for: ${intent.name}`,
        notes: `No LLM function available. Intent ${intent.id} requires LLM to express.`
      });
      results.push({ action: 'gap-created', intent_id: intent.id, gap_id: gap.id });
      continue;
    }

    // Build projection and ask LLM
    const projection = await buildProjection(intent.id);
    const llmView = renderLLM(projection);

    const prompt = `You are an agent working on intent "${intent.name}" (${intent.id}).
Test condition: ${intent.test_condition}

Context: ${JSON.stringify(llmView).slice(0, 3000)}

Produce the expression artifacts (describe what was implemented). Return JSON: { "name": "...", "description": "...", "artifacts": {...} }`;

    try {
      const response = await llm(prompt);
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (agent.trust_level === 'full' || agent.trust_level === 'express-only') {
          const expr = await recordExpression({
            intent_ids: [intent.id],
            artifacts: parsed.artifacts || { agent: agentId, auto: true },
            name: parsed.name || `Agent ${agentId} expression`,
            description: parsed.description
          });
          results.push({ action: 'expressed', intent_id: intent.id, expression_id: expr.id });
        }
      } else {
        throw new Error('No JSON in LLM response');
      }
    } catch (e) {
      const gap = await createGap({
        name: `Agent ${agentId} stuck on: ${intent.name}`,
        notes: `Error: ${e.message}. Intent: ${intent.id}`
      });
      results.push({ action: 'gap-created', intent_id: intent.id, gap_id: gap.id });
    }
  }

  // Set status back to paused (or defined if no work)
  await pool.query("UPDATE gdd.agents SET status = 'paused' WHERE id = $1", [agentId]);

  return { agent_id: agentId, results };
}

module.exports = { activateAgent };
