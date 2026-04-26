# Community Feedback Loop

Optional. The user must opt in before any of this is activated.

## What this does

When enabled, the system posts build reports to the GitHub Discussions page at `kentyler/GraphDrivenDevelopment` after an agent completes work. This creates a shared record of how different models, in different environments, interpret and build from the same skill files.

What gets posted:

- **Build reports** — after an agent completes work, a summary: which intents were expressed, which gaps were created, which model ran the agent, what was produced.
- **Gap nodes** — gaps are already structured in exactly the right form: what was known, what wasn't articulable, what needs human resolution. Posting them to Discussions surfaces ambiguity for whoever can resolve it, with full context.

What does NOT get posted:

- Source code or expressions (the actual implementation stays local)
- Database credentials or environment details
- Anything without the user's explicit opt-in

## Why this matters

The skill files improve through triangulation. When multiple models (Claude, GPT, Gemini, etc.) each build from the same instructions and report where they got stuck, the reports themselves become a comparison surface:

- Where did each model get stuck? (gaps)
- What interpretive choices did each make at the same test condition? (expressions differ)
- Which parts of the instructions were ambiguous? (multiple models created gaps at the same point)
- Which parts were clear? (all models expressed the same intent without difficulty)

A gap created during a build run at 2am in Tokyo appears in Discussions before anyone wakes up, with full context, ready for whoever can resolve it. The loop between implementation and instruction improvement closes automatically.

## Setup

The user needs a GitHub personal access token with `write:discussion` scope.

```
GDD_GITHUB_TOKEN=<token>
GDD_GITHUB_REPO=kentyler/GraphDrivenDevelopment
```

Store the token in an environment variable. Never hardcode it. The same injection pattern as the LLM function — the system doesn't prescribe how the token is provided, just that it's available.

## Mechanism

GitHub Discussions uses the GraphQL API. The key operations:

**Post a build report:**
```graphql
mutation {
  createDiscussion(input: {
    repositoryId: "<repo-id>",
    categoryId: "<build-reports-category-id>",
    title: "Build report: [model] [date] [layers expressed]",
    body: "<markdown summary>"
  }) {
    discussion { url }
  }
}
```

**Post a gap node:**
```graphql
mutation {
  createDiscussion(input: {
    repositoryId: "<repo-id>",
    categoryId: "<gaps-category-id>",
    title: "Gap: [gap name]",
    body: "<gap notes + graph context (dependencies, neighborhood)>"
  }) {
    discussion { url }
  }
}
```

The repository ID and category IDs are fetched once during setup via GraphQL queries and cached.

## Discussion categories

The Discussions page should have at least these categories:

| Category | Purpose |
|----------|---------|
| Build Reports | Automated summaries from build runs |
| Gaps | Gap nodes surfaced during builds — ambiguities needing resolution |
| Skill File Feedback | Human observations about the instructions — what worked, what didn't |
| General | Everything else |

## Integration with agents

For agents, this is a post-work hook. After `activateAgent` completes, if community reporting is enabled, the agent posts a summary of the nodes and edges it created plus any gap nodes. The agent's `id` identifies which agent ran; the active LLM provider identifies which model executed it.

This does not require changes to the agent table. It is a side effect of agent completion, gated by the user's opt-in and the presence of the GitHub token. The graph remains the source of truth; Discussions is a read-only mirror of selected outputs.

## The opt-in conversation

When the building LLM asks the user about participation, it should explain:

1. What will be posted (build reports and gaps — no code, no credentials)
2. Where it goes (public GitHub Discussions)
3. What it's for (improving the skill files through multi-model feedback)
4. What's needed (a GitHub token with `write:discussion` scope)

If the user says no, nothing changes. The system works identically without it. If the user says yes, the token is stored as an environment variable and the post-work hook is enabled.
