# Semantic Revaluation

When a new intent arrives, existing artifacts may be affected — not because they are structurally connected to the new intent, but because they share semantic composition. This skill file describes how the system detects that impact and surfaces it.

The mechanism does not require dependency edges between the affected artifacts. Two artifacts that have never been linked can still resonate on the same primitive. The routing is through semantic composition, not graph topology.

## Background

The intent graph has two propagation mechanisms:

- **Ripples** propagate structural consequences forward through dependency edges. When an intent changes, its `blocked-by` dependents are affected. This is synchronous, deterministic, and follows the graph's explicit wiring.
- **Revaluations** propagate semantic register shifts outward across the artifact catalog. When a new intent arrives, artifacts whose primitive composition overlaps with the intent's impact are candidates for re-examination. This is async, LLM-assisted, and follows primitive resonance rather than explicit edges.

These are not competing mechanisms. Ripples answer "what is structurally connected?" Revaluations answer "what is semantically resonant?" An intent change can trigger both simultaneously, operating on different layers.

## The Primitives

Four semantic primitives form the compositional substrate of all artifacts. See `foundations.md` (Four primitives underlie all artifacts) for the full account.

- **Transduction** — data crossing a context boundary
- **Resolution** — a determination or bifurcation point
- **Boundary** — a scope distinction
- **Trace** — a record that persists

Every artifact is a characteristic combination of these primitives. The combination — the DNA — is recorded as a weight vector on the expression node's `primitive_dna` field.

## Primitive DNA

The DNA is assigned by the LLM at expression creation time. When `recordExpression` is called, the LLM assesses the artifact's primitive composition and produces a weight vector:

```json
{
  "transduction": 0.6,
  "resolution": 0.3,
  "boundary": 0.0,
  "trace": 0.1
}
```

Weights are relative, not absolute. They describe the artifact's characteristic combination, not a score or a ranking. The DNA changes only when the artifact itself changes — when a new expression supersedes an old one, the new expression gets its own DNA.

The set of all expression nodes with their `primitive_dna` fields constitutes the **DNA catalog**. This is not a separate data structure — it is a query over `gdd.nodes WHERE type = 'expression'`. The catalog is small (only artifacts that have been built) and stable (DNA changes only when artifacts change).

## Primitive Impact Signature

When a new intent arrives — through `clientSession`, `transduceExternal`, or `translateRepresentation` — the LLM produces a primitive impact signature as part of the intake call. See `intent-graph.md` (Primitive signature on intake) for how this integrates with the existing transduction flow.

The signature names which primitives are impacted and classifies the impact tier:

- **Tier 1: Operational** — the intent exercises a primitive as currently understood. "Allow partial invoicing" is primarily a Resolution change. Most intents are tier 1.
- **Tier 2: Definitional** — the intent redefines what a primitive means. "All boundary decisions must be auditable" changes what Boundary *is*. Tier 2 is rare and high-consequence.

The tier distinction matters because the impact surfaces are different:

- Tier 1 impacts artifacts weighted toward the specific primitives named in the signature. The DNA matching is selective — only artifacts with significant weight on the impacted primitive are candidates.
- Tier 2 impacts every artifact that carries the redefined primitive at any weight. The entire DNA catalog is scanned for the presence of the affected primitive, regardless of weight.

## Impact Detection

Impact detection is a query, not a background process. When a new intent arrives with its primitive impact signature, the system queries the DNA catalog for artifacts whose composition overlaps with the impacted primitives.

### Tier 1 (operational)

```
For each primitive P in the intent's impact signature:
  SELECT expression nodes WHERE primitive_dna[P] >= threshold
  ORDER BY primitive_dna[P] DESC
```

The threshold is a configuration parameter — it determines how sensitive the impact detection is. A low threshold surfaces more candidates (higher recall, more noise). A high threshold surfaces fewer (lower recall, less noise). A reasonable default is 0.3 — artifacts where the impacted primitive is at least a significant component of the DNA.

### Tier 2 (definitional)

```
For each primitive P being redefined:
  SELECT expression nodes WHERE primitive_dna[P] > 0
  ORDER BY primitive_dna[P] DESC
```

No threshold — any non-zero weight means the artifact carries the redefined primitive and must be re-examined. Tier 2 is deliberately broad because a definitional change affects the substrate itself.

### Output

The impact detection query returns a list of expression nodes — existing artifacts that may be affected by the new intent. This list is:

- **Surfaced in the projection.** When `buildProjection` or `renderHuman` includes the new intent, the impacted artifacts appear as a related section — "artifacts potentially affected by this intent." The human sees which existing work might need re-examination.
- **Available to agents.** An agent scoped to an intent that triggers impact detection receives the impact list as part of its `renderLLM` output. The agent can then assess each candidate and determine whether actual rework is needed.
- **Not automatically acted on.** Impact detection surfaces candidates. It does not create edges, modify nodes, or trigger rework. The determination of whether an artifact actually needs to change remains with the actor — human or agent — who reviews the impact list.

## Vocabulary Evolution

The primitive vocabulary is self-describing. Changes to the set of primitives are expressible as operations of the existing primitives:

- Adding a primitive is Boundary (new distinction) + Resolution (existing set insufficient)
- Removing a primitive is Resolution (apparent distinction is illusory) + Boundary collapse
- Splitting a primitive is Boundary (finer distinction) + Trace (record of why the old was too coarse)
- Merging primitives is Resolution + Boundary collapse
- Redefining a primitive is the extreme tier 2 case — every artifact with that primitive needs re-examination

When the DNA catalog shows consistent classification difficulty — artifacts receiving low confidence on all primitives, or forced into categories that do not fit — that is the signal that the vocabulary needs revision. The revision itself follows the same mechanism: it gets a primitive signature, triggers impact detection across all artifacts carrying the affected primitives, and the catalog is re-assessed.

## Deferred: Revaluation Records

The following capabilities are architecturally sound but deferred until the DNA catalog has accumulated enough artifacts to make them meaningful. They are described here so the building LLM understands the intended trajectory.

### Revaluation records table

A separate table (`gdd.revaluations`) storing immutable records of semantic register shifts on artifacts. Each row records: which expression was re-examined, what triggered the re-examination, what the assessment was (still adequate, needs rework, now serves a different purpose), who assessed it (human or agent), and the confidence level.

This table is the second-order event log — not what happened, but what it meant. The events table records first-order facts. The revaluations table records how the graph reads its own history.

### Threshold firing

An artifact that accumulates multiple revaluation proposals pointing in the same direction — multiple intents suggesting the same kind of rework — commits a revaluation automatically. Incoherent proposals (contradictory assessments from different intents) leave the artifact in a contested state. Contested state is information, not error — it means the artifact is being pulled in multiple directions and needs human judgment.

### Contested state surfacing

An artifact with incoherent revaluation signals is carrying important information about organizational ambiguity. The interface should surface contested artifacts distinctly — not as broken, but as genuinely undetermined. A piece of code with contradictory revaluation signals is a concrete refactoring signal: the artifact is serving purposes that have diverged.

## Related Skills

- `foundations.md` (Four primitives underlie all artifacts) — the primitive definitions and self-describing property
- `intent-graph.md` (Expression type) — the `primitive_dna` field on expression nodes
- `intent-graph.md` (Primitive signature on intake) — how intake produces the impact signature
