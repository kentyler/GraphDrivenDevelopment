# Graph Merge

Multiple intent graphs can coexist — different teams, departments, organizations, or projects each maintaining their own graph. When collaboration is needed, graphs are merged through a structured negotiation, not by fiat.

## Graph identity

Each intent graph has an identity:

```
gdd.graphs:
  id          text        PK
  name        text        Human-readable graph name
  owner       text        Team, department, or organization
  created_at  timestamp
```

Every intent node carries a `graph_id` field indicating which graph it belongs to. Edges can cross graph boundaries — a `blocked-by` edge from an intent in graph A to an intent in graph B is a cross-graph dependency.

## Cross-graph edges

When graph A has an intent that depends on something in graph B, that's a cross-graph `blocked-by` edge. These edges are the interface between graphs — the surface area of collaboration.

Cross-graph edges are created explicitly, not inferred. Both parties must acknowledge the dependency. Creating a cross-graph edge is a mutation in both graphs, recorded in both mutation logs.

| Edge type | Cross-graph meaning |
|-----------|-------------------|
| `blocked-by` | Graph A can't proceed until graph B satisfies something |
| `tensions-with` | The two graphs have intents that pull in different directions |
| `refines` | Graph A's intent is a more specific version of graph B's |

`contains` edges do not cross graph boundaries — composition is internal.

## Merge projection

The core operation: given two or more graph IDs, produce a projection of their intersection.

### `mergeProjection`

**Input**: Two or more graph IDs
**Output**: A projection containing:

- **Shared intents** — intents that reference each other across graphs (via cross-graph edges)
- **Cross-graph edges** — all edges that span graph boundaries
- **Test conflicts** — intents in different graphs whose test conditions contradict each other
- **Throughput comparison** — total downstream throughput in each graph for contested intents
- **Unresolved gaps** — gaps in either graph that affect the intersection
- **Coverage gaps** — intents in one graph that depend on capabilities in the other graph where no intent exists

The merge projection does not modify either graph. It is read-only — a view of the collaboration surface.

### Rendering

The merge projection can be rendered in both forms:

- **Human-legible**: "Graph A needs the auth API (intent auth-api, throughput $300K) before it can proceed with payments. Graph B's auth API intent has a test condition requiring 100ms response time. Graph A's payments intent has a test condition requiring full schema validation on all inputs. These tension with each other."
- **LLM-legible**: Structured JSON with full node data, cross-graph edges, test condition text, throughput values.

The LLM's role is translation — making the intersection legible to both parties. It does not decide the merge.

## Merge sessions

The merge itself is a session — a special kind of intent session where the intent is the collaboration.

1. Parties convene (human, agent, or mixed)
2. LLM reads both graphs, produces the merge projection
3. Projection is rendered human-legible for discussion
4. Parties negotiate:
   - **Resolved tensions** → one side adjusts their test condition, or a new shared intent is created
   - **New cross-graph edges** → dependencies are formalized
   - **New shared intents** → work that both graphs need, created with agreed test conditions and throughput
   - **Unresolvable conflicts** → gap nodes with notes, capturing each side's position
5. Mutations are recorded in both graphs' mutation logs
6. Session closes with a diff showing exactly what changed in each graph

The session records the negotiation: who was there, what each side's position was, what was decided. Full provenance.

## Negotiation through structure

The graph makes negotiation concrete:

**Test conflicts are the negotiation points.** Not "we disagree about the API" but "graph A's test says under 100ms, graph B's test says full validation." The conflict is specific and testable. Resolution means changing one or both test conditions, not reaching a vague agreement.

**Throughput makes tradeoffs visible.** If graph A's contested intent unlocks $500K downstream and graph B's conflicting intent unlocks $200K, the negotiation has a number. Not competing opinions — competing numbers that flow through the same dependency edges.

**Gaps are the honest output.** Where parties can't agree, the result is a gap node with notes capturing both positions. Not a fudged compromise. Not a decision deferred by silence. An explicit record that says "this is unresolved, here's what each side needs, here's what a resolution requires."

**The critical path crosses graphs.** The longest chain of red intents may span multiple graphs. The merge projection shows this — the cross-graph critical path is where coordination matters most. Everything else can proceed independently.

## Organizational patterns

**Department collaboration.** Engineering and product each have a graph. Product creates intents with throughput values (revenue expectations). Engineering creates intents with test conditions (technical specifications). The merge projection shows where product expectations and engineering constraints tension.

**Vendor integration.** Your graph has an intent that depends on a vendor's deliverable. The cross-graph edge formalizes this. The vendor's graph (or a proxy of it) shows their progress. The merge projection shows your risk exposure — how much of your critical path depends on their red intents.

**M&A due diligence.** Two companies considering a merger project their intent graphs. The merge projection shows: overlapping capabilities (redundancy), complementary capabilities (synergy), conflicting test conditions (integration risk), and total throughput (combined value). Due diligence becomes a graph operation.

**Multi-team projects.** Multiple teams working on a shared initiative each maintain their graph. A periodic merge projection shows: cross-team dependencies, blocked teams waiting on other teams, and where the critical path crosses team boundaries. This is the standup meeting replaced by a projection.

## What this is not

This is not automatic graph merging. The merge projection is a view — it shows the intersection and surfaces conflicts. Humans (or agents with appropriate trust and scope) resolve the conflicts. The graph provides structure for negotiation, not a substitute for it.

This is also not federated identity. Each graph remains sovereign. Cross-graph edges are bilateral agreements, not imposed connections. Either party can remove their end of a cross-graph edge (which surfaces as a broken dependency in the other graph — visible, not silent).
