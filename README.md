 # Graph-Driven Development

     A set of skill files that teach a frontier LLM to build a graph-driven development system. You download the
     folder, point your LLM at it, and it builds the system from the instructions.

     ## What this is

     The intent graph is a development system where every piece of work — what needs to exist, what depends on what,
      what "done" looks like, and what was produced — is represented as a testable node in a dependency graph. It
     applies TDD at the architecture level: intents have test conditions, expressions satisfy them, and "what to do
     next" is always "what's red."

     The system supports multiple actor types — humans, LLM agents, application users, external forces — all running
      the same loop through the same graph. Agents are first-class graph entities with scoped jurisdiction,
     trust-bounded write permissions, and auditable sessions.
