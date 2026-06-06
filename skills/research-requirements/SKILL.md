______________________________________________________________________

## name: research-requirements description: Mandatory research protocol before touching external software — using Exa for web context and Context7 for official documentation to eliminate assumptions and guesswork.

Use this skill **before every change involving external software, libraries, SDKs, APIs, packages, dependencies, or configuration formats.** Never rely on assumptions, outdated knowledge, or guesswork.

## Overview

The research protocol requires **two complementary sources** used together — not either/or:

| Source | What it gives you | Tool |
|--------|-------------------|------|
| **Exa** | Current web context — news, blog posts, community discussions, updates, real-world usage | `mcp_exa_web_search_exa` + `mcp_exa_web_fetch_exa` |
| **Context7** | Structured official documentation with code examples — API references, guides, SDK docs | `mcp_context7_resolve_library_id` + `mcp_context7_query_docs` |

Skipping either means missing critical information. Web search alone misses API details. Official docs alone miss ecosystem context.

## When Research Is Required

You **must** research before:

| Scenario | Examples |
|----------|----------|
| **Writing new code with a library** | Using a new npm package, calling an unfamiliar API, importing a framework |
| **Modifying dependency versions** | Upgrading a package, changing a Nix input, switching framework versions |
| **Choosing between competing tools** | React vs Solid, nginx vs caddy, Terraform vs Pulumi |
| **Changing Nix modules** | Any module that wraps or configures external software |
| **Uncertainty about API/syntax/behavior** | Can't remember the exact function signature, not sure if a config option exists |
| **Configuration formats** | YAML, TOML, HCL, JSON schema — anything you're writing by hand |

### When you can skip

- You just read the official docs in a previous step and know the answer
- The change is a trivial mechanical refactor with no external dependency involvement

## Tool Reference

### Exa — Web Search

**`mcp_exa_web_search_exa`** — Search the web for current information.

Key rule: **use natural-language queries describing the ideal page, not keywords.**

```
✅  "blog post comparing React and Vue performance"
❌  "react vs vue"
```

Parameters:

| Parameter | Required | Description |
|-----------|----------|-------------|
| `query` | yes | Natural language description of the ideal page. Include `category:people` or `category:company` for people/company searches. |
| `numResults` | no | Number of results to return (default: 10) |

**`mcp_exa_web_fetch_exa`** — Read a webpage's full content as clean markdown.

Use when the search highlights aren't enough. Batch multiple URLs in one call.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `urls` | yes | Array of URLs to fetch. Batch multiple in one call. |
| `maxCharacters` | no | Max characters per page (default: 3000) |

### Context7 — Official Documentation

Two-step process:

**Step 1: `mcp_context7_resolve_library_id`** — Resolve a package name to a Context7-compatible library ID.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `query` | yes | The question or task you need help with. Used to rank results by relevance. |
| `libraryName` | yes | Official library name with proper punctuation (e.g. "Next.js" not "nextjs", "Three.js" not "threejs") |

Selection criteria for choosing the right library:

- Name similarity to your query
- Source reputation (High > Medium > Low)
- Code snippet count (more = better documentation)
- Benchmark score (100 = highest)
- Description relevance

**Step 2: `mcp_context7_query_docs`** — Query documentation and get code examples.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `libraryId` | yes | The Context7-compatible ID from step 1 (format: `/org/project` or `/org/project/version`) |
| `query` | yes | Specific question about the library. Be detailed — "How to set up authentication with JWT in Express.js" not "auth" |

**Constraints:**

- Do not call `resolve_library_id` more than 3 times per question
- Do not call `query_docs` more than 3 times per question
- You must call `resolve_library_id` first unless the user explicitly provides a library ID

## The Research Flow

```
┌────────────────────────────────────────────────────────────┐
│  1. SEQUENTIAL THINKING         Scope what needs researching │
│     (skill: sequential-thinking)                             │
└───────────────────────┬────────────────────────────────────┘
                        ↓
┌────────────────────────────────────────────────────────────┐
│  2. EXA WEB SEARCH              Current web context         │
│     mcp_exa_web_search_exa                                  │
│     "current state of <topic> best practices 2025"          │
└───────────────────────┬────────────────────────────────────┘
                        ↓
┌────────────────────────────────────────────────────────────┐
│  3. CONTEXT7 DOCS              Official docs + code examples│
│     mcp_context7_resolve_library_id                         │
│     mcp_context7_query_docs                                 │
└───────────────────────┬────────────────────────────────────┘
                        ↓
    ┌── highlights sufficient? ──┐
    │                           │
    YES                         NO
    │                           │
    │    ┌────────────────────────────────────────────────────┐
    │    │  4. EXA WEB FETCH          Full page content        │
    │    │     mcp_exa_web_fetch_exa                           │
    │    │     Fetch best URLs from search results             │
    │    └───────────────────────┬────────────────────────────┘
    │                           │
    └───── both converge ───────┘
                        ↓
┌────────────────────────────────────────────────────────────┐
│  5. SEQUENTIAL THINKING      Synthesize research into plan  │
│     (skill: sequential-thinking)                             │
└───────────────────────┬────────────────────────────────────┘
                        ↓
┌────────────────────────────────────────────────────────────┐
│  6. PROCEED WITH CHANGES     Only after research complete   │
└────────────────────────────────────────────────────────────┘
```

## Query Crafting

### Exa — Natural Language Queries

Describe the page you want to find, not the keywords in it:

```
✅ "official React useState hook documentation with examples"
✅ "blog post explaining WebSocket reconnection strategies in Node.js"
✅ "comparison of Kubernetes ingress controllers nginx vs traefik 2025"
✅ "NixOS module for configuring Prometheus node exporter"
✅ "category:people John Doe software engineer"     # people search
✅ "category:company"                                # company search

❌ "react usestate"
❌ "websocket reconnection nodejs"
❌ "k8s ingress compare"
❌ "nixos prometheus module"
```

### Context7 — Specific Questions

Be precise about what you need to accomplish:

```
✅ "How to set up authentication with JWT in Express.js"
✅ "React useEffect cleanup function examples"
✅ "How to configure tailwind CSS v4 with Next.js 15"

❌ "auth"
❌ "hooks"
❌ "tailwind setup"
```

## Example: Full Research Session

Suppose you need to upgrade a dependency from `axios` to the built-in `fetch`:

```
Step 1 — Sequential thinking:
  Scope: Need to understand Node.js fetch API, compatibility, and migration patterns.
  Sub-questions: Is fetch stable in Node 20+? What are the API differences from axios?
  Any breaking changes? How to handle timeouts, interceptors, error handling?

Step 2 — Exa search:
  mcp_exa_web_search_exa({
    query: "migrating from axios to native fetch Node.js guide 2025"
  })

Step 3 — Context7:
  mcp_context7_resolve_library_id({
    query: "Node.js fetch API usage and best practices",
    libraryName: "Node.js"
  })
  → Library ID: /nodejs/node
  mcp_context7_query_docs({
    libraryId: "/nodejs/node",
    query: "How to use the built-in fetch API for HTTP requests"
  })

Step 4 (if needed) — Exa fetch:
  mcp_exa_web_fetch_exa({
    urls: ["https://example.com/migration-guide"],
    maxCharacters: 5000
  })

Step 5 — Sequential thinking synthesis:
  Synthesize: fetch is stable in Node 18+ (global in 21). Differences from axios:
  - No interceptor API → use wrapper functions
  - No timeout option → AbortController
  - Response.ok vs axios status checks
  Plan: Replace axios calls with fetch, add wrapper for timeout handling.
```

## Best Practices

### Research discipline

- **Research before code, never after** — writing code based on assumptions is the primary source of bugs and wasted effort
- **Both sources, always** — Exa for context, Context7 for API details. Never skip one.
- **Read the results** — scanning titles is not research. Read the highlights and code examples.

### Query optimization

- **Exa queries should describe the ideal page** — "blog post comparing X and Y" will find comparison posts, while "X vs Y" might find anything
- **Context7 queries should describe the task** — "How to do X with library Y" not just "X"
- **If highlights are insufficient, fetch** — `mcp_exa_web_fetch_exa` on the best URLs for full content

### Efficiency

- **Batch Exa fetches** — `mcp_exa_web_fetch_exa` accepts multiple URLs in one call
- **Stay within rate limits** — max 3 calls per tool per question for Context7
- **Don't re-research known things** — if the same docs were fetched 2 steps ago, use that knowledge

### Synthesis

- **Always close with sequential thinking** — synthesize what you learned into a concrete plan before writing code
- **Capture key findings** — API signatures, version requirements, breaking changes, migration patterns
- **Note what you didn't find** — missing documentation is also useful information (API might not exist)

## Relationship to Other Skills

- **sequential-thinking** — The research flow is bookended by sequential thinking (scope → synthesize)
- **knowledge-graph-operations** — Store research findings in the knowledge graph after completion so future sessions don't re-research
