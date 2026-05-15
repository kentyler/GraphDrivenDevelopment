function renderHuman(projection) {
  const lines = [];

  const v = projection.vantage;
  lines.push(`# ${v.name}`);
  const statusLabel = v.is_green ? 'GREEN (satisfied)' : v.has_test ? 'RED (needs work)' : 'UNTESTED (needs test before it can be satisfied)';
  lines.push(`**Status:** ${statusLabel}`);
  if (v.is_superseded) lines.push('**Note:** This intent has been superseded.');
  if (v.test_condition) lines.push(`**Done when:** ${v.test_condition}`);
  if (v.description) lines.push(`\n${v.description}`);
  lines.push('');

  // Board context
  if (projection.board) {
    const b = projection.board;
    lines.push('## Board');
    lines.push(`**${b.id}**: ${b.statement || '(no statement)'}`);
    if (b.edge_statement) lines.push(`**Boundary:** ${b.edge_statement}`);
    if (b.latest_tension) {
      lines.push(`**Latest tension:** ${b.latest_tension.signal} (${b.latest_tension.tension_character || 'uncharacterized'})`);
    }
    lines.push('');
  }

  // Upstream dependencies
  if (projection.upstream.length > 0) {
    lines.push('## Dependencies (must be done first)');
    projection.upstream.forEach(n => {
      const status = n.is_green ? '[GREEN]' : '[RED]';
      lines.push(`- ${status} ${n.name} (${n.id})`);
    });
    lines.push('');
  }

  // Downstream dependents
  if (projection.downstream.length > 0) {
    lines.push('## Unlocks (waiting on this)');
    projection.downstream.forEach(n => {
      const status = n.is_green ? '[GREEN]' : '[RED]';
      lines.push(`- ${status} ${n.name} (${n.id})`);
    });
    lines.push('');
  }

  // Expressions
  if (projection.expressions.length > 0) {
    lines.push('## Expressions (work done)');
    projection.expressions.forEach(e => {
      lines.push(`- ${e.name}: ${e.description || '(no description)'}`);
    });
    lines.push('');
  }

  // Gaps
  const unresolvedGaps = projection.gaps.filter(g => {
    return !projection.edges.some(e => e.to_node === g.id && e.edge_type === 'closes');
  });
  if (unresolvedGaps.length > 0) {
    lines.push('## Open Gaps (blockers needing decisions)');
    unresolvedGaps.forEach(g => {
      lines.push(`- **${g.name}**: ${g.notes || ''}`);
    });
    lines.push('');
  }

  // Edge Nodes (boundary markers — not to be resolved)
  if (projection.edgeNodes && projection.edgeNodes.length > 0) {
    lines.push('## Edge Nodes (boundaries — do not resolve)');
    projection.edgeNodes.forEach(en => {
      const reading = en.latest_reading ? ` — ${en.latest_reading.signal} [${en.latest_reading.board_impact || '?'}]` : '';
      lines.push(`- **${en.name}**: ${en.content || ''}${reading}`);
    });
    lines.push('');
  }

  // Decisions
  if (projection.decisions.length > 0) {
    lines.push('## Decisions Made');
    projection.decisions.forEach(d => {
      lines.push(`- **${d.name}**: ${d.notes || ''}`);
    });
    lines.push('');
  }

  return lines.join('\n');
}

module.exports = { renderHuman };
