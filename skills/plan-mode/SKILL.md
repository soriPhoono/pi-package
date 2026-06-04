---
name: plan-mode
description: Guides the agent through using the Plan Mode extension for safe code analysis and structured task execution with progress tracking.
---

Use this skill when the user enables plan mode, asks about creating or executing a plan, or wants to analyze code before making changes.

## Overview

Plan Mode is a read-only exploration mode that restricts tools to safe operations, allowing the agent to analyze code and create a structured plan before making any changes. Once the plan is approved, execution mode unlocks full tool access and tracks progress.

## Commands

| Command | Description |
|---------|-------------|
| `/plan` | Toggle plan mode on/off |
| `/todos` | Show interactive plan progress with keyboard navigation |
| `Ctrl+Alt+P` | Keyboard shortcut to toggle plan mode |
| `/reload` | Reload the extension after updates |

## Creating a Plan

1. **Enable plan mode** with `/plan` or start pi with `--plan` flag
2. **Ask the agent** to analyze the code and create a plan
3. The agent will output a numbered plan under a `Plan:` header:

```
Plan:
1. First step: analyze the auth module structure
2. Second step: identify error handling gaps
3. Third step: propose refactoring strategy
```

4. The agent presents next steps: **Execute**, **Stay in plan mode**, or **Refine the plan**

### Plan Format Support

The plan parser supports these formats:

- **Numbered**: `1. Step`, `1) Step`
- **Bulleted**: `- Step`, `* Step`
- **Status markers**: `[x] Done`, `[~] In progress`, `[ ] Pending`, `[>] Working`

## Executing a Plan

1. Choose **"Execute the plan"** when prompted
2. The agent runs each step in sequence with full tool access
3. The agent marks progress with:
   - `[DONE:n]` — marks step `n` as completed
   - `[WORKING:n]` — marks step `n` as in-progress
4. A widget shows live progress: `☐ pending`, `◐ in progress`, `☑ completed`
5. When all steps are done, the extension announces plan completion

## `plan_tool` — LLM-Callable Plan Management

The `plan_tool` lets the agent programmatically manage plan items. Actions:

| Action | Parameters | Description |
|--------|------------|-------------|
| `list` | — | List all current plan items with status |
| `add_step` | `text`* | Add a new step to the plan |
| `remove_step` | `step`* | Remove a step by number |
| `reorder_steps` | `stepOrder`* | Reorder steps (array of step numbers) |
| `update_step` | `step`*, `text`* | Update a step's description |
| `set_step_status` | `step`*, `status`* | Set step to `pending`, `in_progress`, or `completed` |
| `create_from_text` | `text`* | Parse a "Plan:" section from text and create items |

*Required parameters

## Interactive `/todos` Command

The `/todos` command shows an interactive plan viewer:

- **↑↓ arrows** — Navigate between steps
- **Enter** — Toggle step completion
- **Esc** — Close the viewer
- Shows colors: green for completed, yellow for in-progress, gray for pending

## Session Resilience

Plan state is automatically persisted and can survive:

- **Session resume** (`/resume`) — State restored from custom entries
- **Session compaction** (`/compact`) — Re-persisted before compaction runs
- **Extension reload** (`/reload`) — State survives via `appendEntry`
- **Session reconstruction** — If custom entries are lost, state is rebuilt from:
  1. Message entries (`plan-todo-list`, `plan-mode-execute`)
  2. Assistant messages containing "Plan:" sections

## Keyboard Shortcuts in `/todos`

| Key | Action |
|-----|--------|
| `↑` / `↓` | Navigate steps |
| `Enter` | Toggle selected step completed/pending |
| `Esc` | Close the viewer |
