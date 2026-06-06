______________________________________________________________________

## name: knowledge-graph-model description: Conceptual model of the persistent knowledge graph memory — entities, relations, observations, naming conventions, and what data belongs where.

Use this skill when deciding how to structure information in the knowledge graph, what type of data to store, or how to name entities for consistency.

## Overview

The knowledge graph is a persistent memory store that survives across sessions and is shared between all conversations. It stores structured knowledge as a graph of **entities** connected by **relations**, each entity carrying a set of **observations** (factual statements).

It is the agent's long-term memory — use it aggressively to remember and recall user context.

## Core Concepts

### Entities

An **entity** is a node in the graph representing a real-world thing. Every entity has:

| Field | Description |
|-------|-------------|
| **name** | Unique identifier (see naming conventions below) |
| **entityType** | Category classifier (user, project, node, session, preference, system, skill) |
| **observations** | Array of factual statements about the entity |

### Observations

An **observation** is a single factual statement attached to an entity. Observations are the leaf-level facts that make up the entity's knowledge.

Rules:

- One fact per observation — atomic and specific
- Written in present tense, active voice where possible
- Should be independently meaningful (someone reading it cold should understand)
- Can be anything: preferences, technical details, relationships, status

### Relations

A **relation** is a directed edge connecting two entities. Relations should be in **active voice**.

| Field | Description |
|-------|-------------|
| **from** | Source entity name |
| **to** | Target entity name |
| **relationType** | Active-verb phrase describing the connection |

Examples: `maintains`, `configures`, `uses`, `prefers`, `tracks`, `contains`, `has_pull_request`

## Entity Naming Convention

Use a consistent naming scheme with a **namespace prefix** and a **unique name**:

```
<namespace>/<identifier>
```

| Entity name pattern | entityType | Purpose | Example |
|---|---|---|---|
| `user/<username>` | `user` | Profile for a human operator | `user/sphoono` |
| `project/<name>` | `project` | Per-project entity | `project/homelab` |
| `session/<topic>` | `session` | Active work tracking | `session/ci-monitoring` |
| `preference/<category>` | `preference` | Categorical preferences | `preference/communication` |
| `node/<hostname>` | `node` | Machine/host | `node/ares` |
| `system/<name>` | `system` | System/tool configuration | `system/pi-agent` |
| `skill/<name>` | `skill` | Agent skill definition | `skill/git-worktrees` |

### entityType Reference

| entityType | When to use |
|------------|-------------|
| `user` | A person — their identity, role, preferences, habits |
| `project` | A codebase, configuration repo, or body of work |
| `session` | An active or recent work session — tracks subtasks, blockers, decisions, next steps |
| `preference` | A categorical set of preferences — communication style, code style, tools |
| `node` | A physical or virtual machine — hostname, role, specs, location in infrastructure |
| `system` | A software system or tool — its configuration, version, location |
| `skill` | An agent skill available in a project — its purpose and location |

## What to Store by Entity Type

### `user` entities

Store **identity, preferences, technical profile, and working style**:

- Name, handles, usernames
- Communication style preferences (concise vs verbose, formality, format)
- Technical expertise level per domain
- Workflow preferences (editor, tools, patterns)
- Common frustrations and pain points
- Hardware and dev environment details
- Goals and priorities
- Time zone, work schedule
- Decision-making patterns

### `project` entities

Store **architecture, conventions, decisions, and structure**:

- Purpose and scope of the project
- Language, framework, build system
- Key architectural decisions
- Directory structure and module organization
- Code style and naming conventions
- Testing patterns and frameworks
- CI/CD setup
- Deployment patterns
- Third-party dependencies and their purpose
- Recent changes and the reasoning behind them
- Known issues or tech debt

### `session` entities

Store **active work tracking**:

- What task is being worked on
- Subtasks and their completion status
- Blockers encountered
- Decisions made during the session
- Commands run and their results
- Next steps after the session
- Links to relevant PRs, issues, or commits
- Branch names and git state

### `preference` entities

Store **categorical preferences** that span multiple projects or contexts:

- Communication: tone, length, structure, formality
- Code style: naming, formatting, testing, documentation
- Tools: preferred editors, debuggers, analyzers
- Workflow: git style, approval gates, review patterns

### `node` entities

Store **machine information**:

- Hostname, role (workstation, server, laptop)
- Operating system and version
- Primary user(s)
- Purpose and typical workloads
- Location in network infrastructure
- Configuration file location
- Notable hardware specs

### `system` entities

Store **system/tool configuration details**:

- What the system is and its version
- How it's configured (Nix module, config file, etc.)
- Where the configuration lives
- Integration points with other systems

## Example Data Structures

### User entity

```
name: user/sphoono
entityType: user
observations:
  - Homelab maintainer and NixOS enthusiast
  - Goes by soriPhoono on GitHub
  - Uuses NixOS with flakes for all systems
  - Uses helix as text editor
  - Likes conventional commits with descriptive bodies
  - Expects agent to ask for approval before pushing or destructive actions
```

### Project entity

```
name: project/homelab
entityType: project
observations:
  - NixOS homelab using flakes with dynamic discovery
  - Host configs in nix/systems/
  - Deploys with nh os switch .
  - GitHub repo at github.com/soriPhoono/homelab
```

### Relation examples

```
{ from: "user/sphoono", to: "project/homelab", relationType: "maintains" }
{ from: "user/sphoono", to: "node/ares", relationType: "uses" }
{ from: "project/homelab", to: "node/ares", relationType: "configures" }
{ from: "user/sphoono", to: "preference/communication", relationType: "prefers" }
{ from: "project/homelab", to: "session/ci-monitoring", relationType: "has_pull_request" }
```

## Guiding Principles

- **Store facts, not prose** — Observations should be concise, specific, independently meaningful statements
- **One observation per fact** — If you'd use "and" to join two things, split them
- **Relations in active voice** — "maintains" not "is maintained by", "configures" not "is configured by"
- **Namespaces prevent collisions** — Always use the `<namespace>/<identifier>` pattern
- **Keep observations current** — Update or delete observations when context changes; stale facts are worse than no facts
- **Cross-reference with relations** — Connect related entities so the graph can be navigated
