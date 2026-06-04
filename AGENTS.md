# pi-package — AGENTS.md

This file provides context for the pi coding agent when working in this repository.

## Project Overview

**pi-package** is a [pi](https://github.com/earendil-works/pi) agent plugin package that extends the pi coding agent with custom extensions, skills, prompt templates, and themes. It serves as a modular way to add functionality and customize the agent's behavior.

## Repository Structure

```
├── AGENTS.md                        # This file — agent context
└── .pi/                             # Package root (auto-discovered by pi)
    ├── package.json                 # Package manifest (name, version, pi config)
    ├── mcp.example.json             # Example MCP server configuration
    ├── tsconfig.json                # TypeScript config for extensions
    ├── extensions/                  # TypeScript extension modules
    │   ├── safe-bash.ts             # Safe bash extension (permission gating)
    │   └── mcp.ts                   # MCP (Model Context Protocol) extension
    ├── skills/                      # Agent skill directories
    │   └── example-skill/
    │       └── SKILL.md             # Skill definition for scaffolding pi packages
    ├── prompts/                     # Markdown prompt templates
    │   └── review.md                # Code review prompt template
    └── themes/                      # Color theme JSON files
        └── solarized.json           # Solarized color theme
```

## Architecture & Conventions

### Package Manifest (`package.json`)

The `pi` key declares which directories pi should discover:

```json
{
  "pi": {
    "extensions": ["./extensions"],
    "skills": ["./skills"],
    "prompts": ["./prompts"],
    "themes": ["./themes"]
  }
}
```

### Extensions

- **Location**: `.pi/extensions/`
- **Language**: TypeScript (compiled by pi at runtime)
- **Pattern**: Default export of a factory function receiving `ExtensionAPI`
- **Features supported**: Lifecycle hooks, custom commands, custom tools
- **Reference**: See `.pi/extensions/safe-bash.ts` or `.pi/extensions/mcp.ts` for examples

### Skills

- **Location**: `.pi/skills/<skill-name>/SKILL.md`
- **Format**: Markdown with YAML frontmatter (`name`, `description`)
- **Pattern**: Each skill directory contains a single `SKILL.md` file
- **Purpose**: Provide structured guidance to the agent on specific tasks
- **Reference**: See `.pi/skills/example-skill/SKILL.md` for an example

### MCP Extension (`.pi/extensions/mcp.ts`)

Connects to [MCP (Model Context Protocol)](https://modelcontextprotocol.io) servers and exposes their tools as native pi tools the LLM can call.

**Configuration**: Copy `.pi/mcp.example.json` to `~/.pi/agent/mcp.json` (user-wide) or `.pi/mcp.json` (project-local) and configure your servers. Uses the same format as Claude Desktop's `mcpServers`.

**Supported transports**:
- **stdio**: `command` + `args` to spawn a local MCP server process
- **SSE/Streamable HTTP**: `url` + `transport` for remote MCP servers

**Tool naming**: MCP tools are registered as `{serverName}_{toolName}` (e.g., `filesystem_read`).

**Commands**:
- `/mcp` — List connected MCP servers, their tools, and status
- `/mcp reconnect` — Reconnect all servers
- `/mcp reconnect <name>` — Reconnect a specific server
- `/mcp reload` — Reload config from disk and reconnect all

**Limitations**:
- Tools are only registered at connection time. To pick up new tools from a server, use `/mcp reconnect`.
- `pi.registerTool()` has no removal API, so tools from disconnected servers persist until `/reload` or session restart.

### Plan Mode Extension (`.pi/extensions/plan-mode.ts`)

Read-only exploration mode for safe code analysis. When enabled, only read-only tools are available and bash is restricted to allowlisted commands.

**Features**:
- `/plan` command or `Ctrl+Alt+P` to toggle plan mode
- `/todos` command to show current plan progress
- `--plan` CLI flag to start in plan mode
- Bash restricted to an allowlist of read-only commands (file inspection, search, directory listing, git read-only, etc.)
- Extracts numbered steps from `Plan:` sections in assistant responses
- `[DONE:n]` markers to track step completion during execution
- Progress widget in the footer showing completion status
- Session persistence (state survives session resume)

**Workflow**:
1. Enable plan mode with `/plan` or `--plan` flag
2. Ask the agent to analyze code and create a numbered plan under a `Plan:` header
3. The agent outputs a plan with read-only tools
4. Choose "Execute the plan" when prompted
5. During execution, the agent marks steps complete with `[DONE:n]` tags
6. Progress widget shows completion status

**Restricted tools in plan mode**: `read`, `bash`, `grep`, `find`, `ls`, `questionnaire`

### Prompt Templates

- **Location**: `.pi/prompts/`
- **Format**: Plain Markdown files
- **Usage**: Invoked by the user via `/templatename` in the editor
- **Reference**: See `.pi/prompts/review.md` for an example

### Themes

- **Location**: `.pi/themes/`
- **Format**: JSON files with all 51 required color tokens
- **Optional**: `vars` object for reusable palette references
- **Schema**: See theme schema in [pi coding-agent theme docs](https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/src/modes/interactive/theme/theme-schema.json)
- **Reference**: See `.pi/themes/solarized.json` for an example

## Key Dependencies

- **`@earendil-works/pi-coding-agent`** (peer): Provides `ExtensionAPI` and runtime types
- **`typebox`** (peer): Used for structured tool parameter schemas
- **`@modelcontextprotocol/sdk`** (runtime): MCP client SDK for connecting to MCP servers

## Development Workflow

1. **Edit** source files in the appropriate `.pi/` subdirectory
2. **Reload** changes in pi with the `/reload` command (no restart needed)
3. **Verify** the new command, tool, or skill works as expected
4. **Test** TypeScript changes with `tsc --noEmit` if desired

## Common Tasks

| Task | What to do |
|------|-----------|
| **Add a new extension** | Create `.pi/extensions/<name>.ts` following the `ExtensionAPI` factory pattern |
| **Add a new skill** | Create `.pi/skills/<name>/SKILL.md` with YAML frontmatter |
| **Add a new prompt template** | Create `.pi/prompts/<name>.md` with Markdown content |
| **Add a new theme** | Create `.pi/themes/<name>.json` with all 51 color tokens |
| **Update manifest** | Modify `pi` key in `.pi/package.json` if a resource is at a non-standard path |
| **Reload changes** | Run `/reload` inside pi |

## Design Principles

- **Keep it modular**: Each resource type lives in its own directory
- **Follow conventions**: Use the established patterns for each resource type
- **Document clearly**: Skills and prompts should be self-documenting
- **Reload, don't restart**: Use `/reload` for fast iteration
