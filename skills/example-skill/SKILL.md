---
name: example-skill
description: Guides the agent through scaffolding pi packages — extensions, skills, prompt templates, and themes. Use when the user asks to create, scaffold, or add a new pi resource or plugin.
---

Use this skill when the user asks about pi packages or needs help scaffolding a new plugin.

## Steps

1. **Understand the request** — Identify whether the user wants to create a new extension, skill, prompt template, or theme.
2. **Check conventions** — Extensions go in `extensions/`, skills in `skills/`, prompts in `prompts/`, themes in `themes/`.
3. **Update manifest** — If the new resource is in a non-standard location, update the `pi` key in `package.json`.
4. **Test with `/reload`** — After adding files, run `/reload` in pi to pick them up without restarting.
5. **Verify** — Run the new command, tool, or skill to confirm it works.

## Requirements

- **Extensions**: TypeScript modules exporting a default factory function receiving `ExtensionAPI`.
- **Skills**: Follow the Agent Skills standard — a directory with `SKILL.md` containing YAML frontmatter (`name`, `description`) and Markdown body.
- **Prompt templates**: Plain Markdown files invoked via `/templatename`.
- **Themes**: JSON files with all 51 required color tokens; optional `vars` for reusable palette references.
