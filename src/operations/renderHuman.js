function renderHuman(projection) {
  const lines = [];

  const v = projection.vantage;
  lines.push(`# ${v.name}`);
  lines.push(`**Status:** ${v.is_green ? 'GREEN (satisfied)' : 'RED (needs work)'}`);
  if (v.is_superseded) lines.push('**Note:** This intent has been superseded.');
  if (v.test_condition) lines.push(`**Done when:** ${v.test_condition}`);
  if (v.description) lines.push(`\n${v.description}`);
  lines.push('');

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
