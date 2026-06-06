______________________________________________________________________

## name: knowledge-graph-operations description: Practical guide for reading, writing, and maintaining the persistent knowledge graph memory — tool reference, session lifecycle, and usage patterns.

Use this skill when reading or writing to the knowledge graph, managing session context, deciding which tool to use for a memory operation, or following the knowledge lifecycle.

## Tool Reference

### Search and Read

| Tool | When to use | What it does |
|------|-------------|--------------|
| `mcp_memory_search_nodes(query)` | **Session start**, before any task, when you need relevant context | Searches all entities by name, type, and observation content. Returns matches with their observations and relations. Best entry point for recalling context. |
| `mcp_memory_open_nodes(names[])` | When you know the exact entity names you need | Opens specific entities by name and returns their full observations and relations. More targeted than search when you know what you're looking for. |
| `mcp_memory_read_graph()` | Full audit, debugging, or when you need to see everything | Returns the entire graph — all entities and all relations. Use sparingly on large graphs. |

### Write

| Tool | When to use | What it does |
|------|-------------|--------------|
| `mcp_memory_create_entities(entities[])` | Creating new entities for the first time | Creates one or more entities with initial observations. Each entity needs `name`, `entityType`, and `observations[]`. |
| `mcp_memory_add_observations(observations[])` | Adding new facts to existing entities | Appends observations to entities that already exist. Specify `entityName` and `contents[]`. |
| `mcp_memory_create_relations(relations[])` | Connecting entities | Creates directed relations between entities. Each needs `from`, `to`, and `relationType` (active voice). |

### Delete and Cleanup

| Tool | When to use | What it does |
|------|-------------|--------------|
| `mcp_memory_delete_entities(entityNames[])` | Removing outdated entities and all their relations | Deletes entities by name and cascades to remove all associated relations. |
| `mcp_memory_delete_observations(deletions[])` | Removing specific stale facts | Removes specific observation strings from entities. Specify `entityName` and `observations[]` to delete. |
| `mcp_memory_delete_relations(relations[])` | Removing connections between entities | Deletes specific relations by `from`, `to`, and `relationType`. |

## Lifecycle

### Session Start — Recall

Before starting any task, recall relevant context:

```
1. Search for the user:     mcp_memory_search_nodes("sphoono")
2. Search for the project:  mcp_memory_search_nodes("homelab")
3. Search for the topic:    mcp_memory_search_nodes("<topic>")
```

Review what you find. Note preferences, open sessions, project conventions, and recent decisions. This avoids asking the user questions they've already answered.

### During Conversation — Capture

When the user reveals information that should be remembered, store it immediately:

- **New preferences**: Create a `preference/<category>` entity or add observations to an existing one
- **New project context**: Add observations to the `project/<name>` entity
- **Session progress**: Update `session/<topic>` with decisions, blockers, next steps
- **User details**: Add observations to `user/<username>`

### After Completing a Task — Summarize

Store a summary of what was done:

```markdown
Which entities to update:
- session/<topic>: Mark complete, note outcomes and decisions
- project/<name>: Add architectural decisions or conventions established
- user/<username>: Add any newly learned preferences

What to store:
- What was accomplished
- Key decisions made and the reasoning
- Files changed (brief summary)
- Any unresolved issues or follow-up items
- Commands run or configurations applied
```

### Before Significant Changes — Full Recall

Before making changes that could have broad impact:

```
1. mcp_memory_read_graph()        — See the full picture
2. mcp_memory_search_nodes(key)   — Targeted searches for relevant context
```

Review all stored context about the user, project, and related systems to avoid mistakes.

## CRUD Patterns

### Creating a new entity with relations

```typescript
// 1. Create the entity
mcp_memory_create_entities({
  entities: [{
    name: "session/deploy-fix",
    entityType: "session",
    observations: [
      "Investigating failed deployment on staging",
      "Server logs show 503 on /api/v2/health",
      "Rolled back to v1.3.2"
    ]
  }]
})

// 2. Connect it to related entities
mcp_memory_create_relations({
  relations: [
    { from: "user/sphoono", to: "session/deploy-fix", relationType: "tracks" },
    { from: "project/homelab", to: "session/deploy-fix", relationType: "has_session" }
  ]
})
```

### Adding facts to existing entities

```typescript
mcp_memory_add_observations({
  observations: [{
    entityName: "user/sphoono",
    contents: [
      "Discovered preference for using deterministic deployment hashes",
      "Migrated all systems to flake-based deployment"
    ]
  }]
})
```

### Removing stale information

```typescript
// Remove outdated observations
mcp_memory_delete_observations({
  deletions: [{
    entityName: "session/deploy-fix",
    observations: ["Rolled back to v1.3.2"]
  }]
})

// Remove outdated relations
mcp_memory_delete_relations({
  relations: [
    { from: "project/homelab", to: "session/deploy-fix", relationType: "has_session" }
  ]
})

// Remove entire outdated entities
mcp_memory_delete_entities({
  entityNames: ["session/deploy-fix"]
})
```

## When to Use Each Pattern

### Search before asking

Always search the knowledge graph before asking the user a question. If the answer is already stored, don't ask again.

**Search first, ask second.**

### Create on first encounter

When you first meet a new user, project, or start a new topic:

1. Create a `user/<name>`, `project/<name>`, or `session/<topic>` entity
1. Populate it with initial observations
1. Create relations to connect it to existing entities

### Append during conversation

As the user reveals preferences, makes decisions, or provides context:

- Add observations to the relevant entity
- Don't overwrite — append. Observations accumulate.

### Delete on context change

When the user changes their mind, migrates away from a tool, or completes a session:

- Remove stale observations from entities
- Remove relations that are no longer relevant
- Remove entire entities that are no longer needed

## Common Workflows

### Starting a new project

```text
1. mcp_memory_search_nodes("sphoono")        — recall user context
2. Create project/<name> entity               — project metadata
3. Create relations to user, nodes, systems   — connect the graph
4. Add initial observations                   — architecture, conventions
```

### Tracking a work session

```text
1. Create session/<topic>               — track the work
2. Add observations as you go           — decisions, blockers, commands
3. Create relations to project, user    — connect to context
4. On completion, add final summary     — outcomes, next steps
5. Optionally delete or archive         — clean up when done
```

### Learning user preferences

```text
1. Search for preference/<category>     — check if it exists
2. Create if missing, or append         — store the preference
3. Create "prefers" relation            — connect user to preference
```

## Best Practices

- **Search is your first step** — always search before creating. Avoid duplicates.
- **Write immediately** — when you learn something, store it in the same turn. Don't defer.
- **One tool call per operation** — `create_entities` and `create_relations` accept arrays. Batch when possible.
- **Keep observations atomic** — one fact per string. Arrays are the collection mechanism.
- **Delete stale data** — old facts mislead. When context changes, update the graph.
- **Use session entities for active work** — they're temporary and can be cleaned up after the session ends.
- **Prefer search_nodes over read_graph** — read_graph is expensive for large graphs. Search is targeted.
