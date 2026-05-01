function renderLLM(projection) {
  return {
    vantage: {
      id: projection.vantage.id,
      type: projection.vantage.type,
      name: projection.vantage.name,
      description: projection.vantage.description,
      test_condition: projection.vantage.test_condition,
      test_verification: projection.vantage.test_verification,
      is_green: projection.vantage.is_green,
      is_superseded: projection.vantage.is_superseded
    },
    upstream: projection.upstream.map(n => ({
      id: n.id, type: n.type, name: n.name,
      test_condition: n.test_condition,
      is_green: n.is_green, is_superseded: n.is_superseded
    })),
    downstream: projection.downstream.map(n => ({
      id: n.id, type: n.type, name: n.name,
      test_condition: n.test_condition,
      is_green: n.is_green, is_superseded: n.is_superseded
    })),
    edges: projection.edges.map(e => ({
      from: e.from_node, to: e.to_node, type: e.edge_type
    })),
    gaps: projection.gaps.map(g => ({
      id: g.id, name: g.name, notes: g.notes
    })),
    decisions: projection.decisions.map(d => ({
      id: d.id, name: d.name, description: d.description, notes: d.notes
    })),
    expressions: projection.expressions.map(e => ({
      id: e.id, name: e.name, description: e.description,
      artifacts: e.artifacts
    }))
  };
}

module.exports = { renderLLM };
