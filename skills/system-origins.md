# System Origins

This skill file defines **Layer -1**: the founding intents that precede the graph itself. These intents record the decisions made before any graph operation was possible — substrate choice, runtime environment, protocol selection, configuration strategy, and the axiomatic founding moment.

Read `intent-graph.md` and `foundations.md` first.

## Why this layer exists

The self-hosting proof in `foundations.md` says: the graph must be able to represent the construction of everything it tracks. `gdd-root` acknowledges the founding moment philosophically. Layer -1 completes the proof operationally: it inscribes the pre-graph decisions into the graph in the same vocabulary used for everything else.

Without Layer -1, the system's substrate choice (PostgreSQL) lives only in prose in `intent-graph.md`. That prose is outside the graph's reasoning machinery — it cannot be queried, superseded through normal graph operations, or discovered by an actor asking "why does the system use this database?" Layer -1 makes those decisions first-class graph citizens.

## Key property: nodes arrive already green

Every node in this layer is inserted already satisfied. The intent node and its expression node are inserted together, with the `satisfies` edge already present. No actor ever works these intents. They are historical record, not work queue.

This is the same posture as `gdd-root` — a founding moment inserted by the bootstrap script directly, outside the normal graph mechanism. The difference is that `gdd-root` is a single philosophical anchor; Layer -1 is the set of concrete decisions that surround it.

## The supersession contract

The point of inscribing these decisions is to make them supersedeable. When the time comes to change the substrate — or any other founding decision — the operation is:

1. Create a new intent (if the abstract intent itself is being refined) or skip to step 2
2. Create a new expression node recording the new choice
3. Add a `satisfies` edge from the new expression to the abstract intent
4. Supersede the old expression node via a `supersedes` edge (new → old)

The abstract intent stays green throughout. Downstream intents that are `blocked-by` the abstract intent are unaffected — they depend on the intent, not on the specific expression. The supersession chain records what changed and why. The substrate swap is a graph event with full provenance.

## Compose node

Add `system-origins` as a child of `gdd-root`. Its test condition is structural: all children green. Since all children arrive already green, `system-origins` is green from the moment of insertion — it does not change the bootstrap sequence or add any red work.

Update `gdd-root`'s children array (in `intent-graph-layers.md`) to include `"system-origins"` alongside the existing seven children.

```json
{
  "id": "system-origins",
  "type": "compose",
  "name": "System origins",
  "description": "The founding decisions inscribed in the graph retroactively. These nodes document what was decided before the graph existed, in the graph's own vocabulary. All children arrive already satisfied — this compose is green from insertion. Its purpose is to make pre-graph decisions queryable, legible, and supersedeable through normal graph operations.",
  "children": [
    "persist-graph-state",
    "serve-http",
    "mcp-reachability",
    "schema-namespacing",
    "config-injection",
    "founding-moment"
  ]
}
```

## Layer -1 nodes

Each entry below is a pair: an abstract intent node and its initial expression node. Insert both during bootstrap, along with the `satisfies` edge connecting them.

---

### 1. Persistent graph state

```json
{
  "id": "persist-graph-state",
  "type": "intent",
  "name": "System persists graph state reliably",
  "description": "The graph's nodes, edges, and all operational tables survive process restarts. State is not held in memory. Any actor reading the graph after a restart sees the same graph as before.",
  "test": {
    "condition": "After a process restart, queryIncomplete returns the same results as before the restart. No data loss on shutdown.",
    "verification": "Insert a test node, restart the server process, query for the node — it must be present."
  }
}
```

```json
{
  "id": "persist-graph-state-postgres",
  "type": "expression",
  "name": "PostgreSQL via gdd schema",
  "description": "Graph state is persisted in a PostgreSQL database. All tables live in the gdd schema within the gdd database. Connection parameters are injected via environment variables.",
  "artifacts": {
    "substrate": "postgresql",
    "version_minimum": "14",
    "database": "gdd",
    "schema": "gdd",
    "connection_env": {
      "GDD_DB_HOST": "localhost",
      "GDD_DB_PORT": "5432",
      "GDD_DB_NAME": "gdd",
      "GDD_DB_USER": "postgres",
      "GDD_DB_PASSWORD": "(prompted or env)"
    },
    "client_library": "pg (node-postgres)",
    "rationale": "PostgreSQL chosen for JSONB support (artifacts, primitive_dna, scope, trigger fields), mature reliability, broad availability, and zero additional infrastructure for single-node deployments."
  }
}
```

Edge: `satisfies` from `persist-graph-state-postgres` → `persist-graph-state`

---

### 2. HTTP operation surface

```json
{
  "id": "serve-http",
  "type": "intent",
  "name": "Graph operations are accessible over HTTP",
  "description": "All graph operations — intent creation, projection building, expression recording, agent management — are reachable via HTTP. The server handles request routing, JSON serialization, and error responses. No graph operation requires direct database access from outside the server process.",
  "test": {
    "condition": "POST /api/intents creates a node and returns it. GET /api/intents/:id returns the node. All graph operations respond to HTTP requests with appropriate status codes.",
    "verification": "curl POST and GET against a running server instance."
  }
}
```

```json
{
  "id": "serve-http-express",
  "type": "expression",
  "name": "Express.js on Node.js",
  "description": "HTTP surface is provided by Express running on Node.js. The same process serves both the REST API and the MCP endpoint.",
  "artifacts": {
    "runtime": "node.js",
    "framework": "express",
    "default_port": 3000,
    "port_env": "GDD_PORT",
    "rationale": "Express chosen for minimal footprint, widespread familiarity, and straightforward coexistence with the MCP SDK's Streamable HTTP transport on the same process."
  }
}
```

Edge: `satisfies` from `serve-http-express` → `serve-http`

---

### 3. MCP reachability

```json
{
  "id": "mcp-reachability",
  "type": "intent",
  "name": "System is reachable from any MCP-capable tool",
  "description": "The graph is accessible through the Model Context Protocol. Any MCP-capable tool — Claude Desktop, Claude Code, Excel, Word, custom web apps — can connect and invoke graph operations without bespoke integration. The protocol is the interface; the implementation is not privileged.",
  "test": {
    "condition": "An MCP client connecting to /mcp can list available tools and invoke them. The graph responds to MCP tool calls identically to direct HTTP calls.",
    "verification": "Connect Claude Desktop or Claude Code to http://localhost:3000/mcp. Invoke query_incomplete. Verify it returns the current red intents."
  }
}
```

```json
{
  "id": "mcp-reachability-sdk",
  "type": "expression",
  "name": "@modelcontextprotocol/sdk via Streamable HTTP",
  "description": "MCP protocol is implemented using the official TypeScript SDK with Streamable HTTP transport. The /mcp endpoint is mounted alongside Express routes in the same process.",
  "artifacts": {
    "library": "@modelcontextprotocol/sdk",
    "transport": "StreamableHTTPServerTransport",
    "endpoint": "/mcp",
    "rationale": "Official SDK used to track protocol spec evolution. Streamable HTTP chosen over SSE transport for broader compatibility with reverse proxies and HTTP/2."
  }
}
```

Edge: `satisfies` from `mcp-reachability-sdk` → `mcp-reachability`

---

### 4. Schema namespacing

```json
{
  "id": "schema-namespacing",
  "type": "intent",
  "name": "Graph tables are isolated from other database objects",
  "description": "GDD tables do not pollute the public namespace of the host database. Installing GDD into an existing database does not risk name collisions with the host application's tables. The isolation boundary is explicit and inspectable.",
  "test": {
    "condition": "All GDD tables are queryable with a namespace prefix. A SELECT from the public schema returns no GDD tables. Dropping the GDD namespace removes all GDD tables without touching other schemas.",
    "verification": "SELECT table_name FROM information_schema.tables WHERE table_schema = 'gdd' returns all GDD tables. SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' returns none of them."
  }
}
```

```json
{
  "id": "schema-namespacing-gdd-schema",
  "type": "expression",
  "name": "gdd schema in PostgreSQL",
  "description": "All GDD tables live in a dedicated schema named 'gdd' within the host database. All table references are schema-qualified (gdd.nodes, gdd.edges, etc.).",
  "artifacts": {
    "schema_name": "gdd",
    "database_name": "gdd",
    "creation_ddl": "CREATE SCHEMA gdd;",
    "rationale": "A dedicated schema provides clean isolation, straightforward backup/restore of GDD state, and compatibility with existing databases that may already have tables named 'nodes' or 'edges' in their public schema."
  }
}
```

Edge: `satisfies` from `schema-namespacing-gdd-schema` → `schema-namespacing`

---

### 5. Configuration injection

```json
{
  "id": "config-injection",
  "type": "intent",
  "name": "System configuration is provided at runtime without code changes",
  "description": "Database credentials, server port, LLM API keys, and all environment-specific parameters are injectable at startup. No configuration value is hardcoded in source files. The same build artifact runs in development, staging, and production by varying configuration only.",
  "test": {
    "condition": "Starting the server with different GDD_DB_HOST values connects to different databases. No credentials appear in any source file committed to version control.",
    "verification": "grep -r 'password' src/ returns no hardcoded values. Server connects to the database specified in GDD_DB_HOST."
  }
}
```

```json
{
  "id": "config-injection-env-vars",
  "type": "expression",
  "name": "Environment variables with dotenv fallback",
  "description": "All configuration is read from environment variables at startup. A .env file (gitignored) provides defaults for local development. Production environments inject variables directly.",
  "artifacts": {
    "mechanism": "process.env",
    "local_fallback": ".env file via dotenv",
    "gitignore_rule": ".env must be in .gitignore",
    "variables": [
      "GDD_DB_HOST", "GDD_DB_PORT", "GDD_DB_NAME", "GDD_DB_USER", "GDD_DB_PASSWORD",
      "GDD_PORT",
      "GDD_GITHUB_TOKEN", "GDD_GITHUB_REPO"
    ],
    "rationale": "12-factor app convention. Environment variables are universally supported, require no secrets management infrastructure for single-node deployments, and are compatible with all major deployment platforms."
  }
}
```

Edge: `satisfies` from `config-injection-env-vars` → `config-injection`

---

### 6. Founding moment

```json
{
  "id": "founding-moment",
  "type": "intent",
  "name": "Graph has an axiomatic ground before normal operations run",
  "description": "The self-hosting system requires a founding moment that precedes the rules it will subsequently enforce. The schema must exist before nodes can be created. The root intent must exist before the graph can track its own construction. This founding moment is explicit, documented, and inspectable — not hidden as an implementation detail.",
  "test": {
    "condition": "After running the bootstrap script, gdd-root exists in gdd.nodes. The schema and all Layer 0 tables exist. The graph is queryable before any actor has performed any operation.",
    "verification": "SELECT id FROM gdd.nodes WHERE id = 'gdd-root' returns one row immediately after bootstrap and before any other operation."
  }
}
```

```json
{
  "id": "founding-moment-bootstrap-script",
  "type": "expression",
  "name": "Bootstrap script with direct SQL insertion",
  "description": "The founding moment is implemented as a bootstrap script that runs outside the normal graph mechanism. It creates the schema, creates the tables, inserts gdd-root directly via SQL, then inserts all Layer 0-7 intents and edges (including Layer -1 / system-origins nodes). After the bootstrap script completes, the normal graph operations take over.",
  "artifacts": {
    "mechanism": "bootstrap script (e.g. scripts/bootstrap.js or scripts/bootstrap.sql)",
    "privileged_operations": [
      "CREATE SCHEMA gdd",
      "CREATE TABLE gdd.nodes ...",
      "CREATE TABLE gdd.edges ...",
      "INSERT INTO gdd.nodes (id='gdd-root') ...",
      "INSERT INTO gdd.nodes (id='system-origins') ...",
      "INSERT Layer -1 intent and expression pairs with satisfies edges",
      "INSERT Layer 0-7 nodes and edges"
    ],
    "idempotency": "Bootstrap script should be idempotent — safe to re-run. Use CREATE TABLE IF NOT EXISTS and INSERT ... ON CONFLICT DO NOTHING.",
    "rationale": "The bootstrap script is the honest acknowledgment that self-hosting systems have a founding moment that precedes the rules they enforce. Naming it explicitly and keeping it minimal is preferable to hiding it inside a complex initialization sequence."
  }
}
```

Edge: `satisfies` from `founding-moment-bootstrap-script` → `founding-moment`

---

## Bootstrap insertion sequence

In the bootstrap script, insert Layer -1 **after** creating the schema and tables but **before** inserting `gdd-root` and the Layer 0-7 intents. The order within the bootstrap script:

```
1. CREATE SCHEMA gdd (if not exists)
2. CREATE TABLE gdd.nodes, gdd.edges, gdd.graphs, gdd.graph_memberships, gdd.agents, gdd.skills, gdd.llm_providers (if not exists)
3. CREATE TYPE enums (if not exists)
4. INSERT system-origins compose node
5. INSERT all six Layer -1 intent nodes
6. INSERT all six Layer -1 expression nodes
7. INSERT all six satisfies edges (expression → intent)
8. INSERT contains edges (system-origins → each intent node)
9. INSERT gdd-root (with system-origins as an additional child)
10. INSERT Layer 0-7 nodes and edges
11. INSERT contains edge (gdd-root → system-origins)
```

All inserts use `ON CONFLICT DO NOTHING` for idempotency.

---

## Edge summary for Layer -1

```
system-origins                      ->  (contained by)  ->  gdd-root
persist-graph-state                 ->  (contained by)  ->  system-origins
serve-http                          ->  (contained by)  ->  system-origins
mcp-reachability                    ->  (contained by)  ->  system-origins
schema-namespacing                  ->  (contained by)  ->  system-origins
config-injection                    ->  (contained by)  ->  system-origins
founding-moment                     ->  (contained by)  ->  system-origins
persist-graph-state-postgres        ->  (satisfies)     ->  persist-graph-state
serve-http-express                  ->  (satisfies)     ->  serve-http
mcp-reachability-sdk                ->  (satisfies)     ->  mcp-reachability
schema-namespacing-gdd-schema       ->  (satisfies)     ->  schema-namespacing
config-injection-env-vars           ->  (satisfies)     ->  config-injection
founding-moment-bootstrap-script    ->  (satisfies)     ->  founding-moment
```

---

## Superseding a founding decision

When a founding decision changes — substrate migration, runtime change, protocol upgrade — the operation is:

```
1. Create new expression node (e.g. persist-graph-state-neo4j)
   with artifacts describing the new choice
2. INSERT satisfies edge: new-expression → persist-graph-state
3. INSERT supersedes edge: new-expression → old-expression
```

The abstract intent (`persist-graph-state`) remains green throughout. Its test condition remains the same — the substrate must survive restarts, regardless of which substrate. The downstream intents (`foundation-tables`, etc.) that are `blocked-by` `persist-graph-state` are unaffected.

If the abstract intent itself needs revision — if "persists graph state reliably" turns out to be the wrong framing — supersede the intent node the same way any intent is superseded: new intent node + `supersedes` edge. This is the tier-2 revaluation case from `revaluation.md`: a definitional change that should trigger impact detection across artifacts carrying the Trace primitive.

---

## Related skills

- `foundations.md` — Self-hosting proof, the founding moment, TOC lineage
- `intent-graph.md` — Prerequisites section (the prose this layer inscribes as graph nodes), Build Order
- `intent-graph-layers.md` — Layer 0-7 definitions; add `system-origins` to `gdd-root`'s children array
- `graph-completeness.md` — Write-only semantics, supersession pattern
- `revaluation.md` — Tier-2 (definitional) impact detection, relevant when a founding decision is redefined
