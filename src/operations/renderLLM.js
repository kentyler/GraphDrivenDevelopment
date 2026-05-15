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
      is_superseded: projection.vantage.is_superseded,
      has_test: projection.vantage.has_test
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
    edges: projection.edges.map(e => {
      const edge = { from: e.from_node, to: e.to_node, type: e.edge_type };
      if (e.description) edge.description = e.description;
      if (e.created_by) edge.created_by = e.created_by;
      return edge;
    }),
    gaps: projection.gaps.map(g => ({
      id: g.id, name: g.name, notes: g.notes
    })),
    decisions: projection.decisions.map(d => ({
      id: d.id, name: d.name, description: d.description, notes: d.notes
    })),
    expressions: projection.expressions.map(e => ({
      id: e.id, name: e.name, description: e.description,
      artifacts: e.artifacts
    })),
    board: projection.board ? {
      id: projection.board.id,
      statement: projection.board.statement,
      edge_statement: projection.board.edge_statement,
      status: projection.board.status,
      latest_tension: projection.board.latest_tension ? {
        signal: projection.board.latest_tension.signal,
        tension_character: projection.board.latest_tension.tension_character
      } : null
    } : null,
    axioms: (projection.axioms || []).map(a => ({
      id: a.id, name: a.name, notes: a.notes, description: a.description
    })),
    edge_nodes: (projection.edgeNodes || []).map(en => ({
      id: en.id, name: en.name, content: en.content,
      weight: en.weight, status: en.status,
      latest_reading: en.latest_reading ? {
        signal: en.latest_reading.signal,
        board_impact: en.latest_reading.board_impact
      } : null
    }))
  };
}

module.exports = { renderLLM };
