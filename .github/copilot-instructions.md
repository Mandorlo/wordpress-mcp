# WordPress MCP Server - GitHub Copilot Instructions

This document provides context and guidance for AI agents (including GitHub Copilot) working on this WordPress MCP Server project.

## Project Overview

This is a **Model Context Protocol (MCP) server** for WordPress administration via SSH. It allows AI agents to manage WordPress sites remotely through WP-CLI commands.

## Architecture Principles

### Tool Design: Less is More

Based on Anthropic's research on [Code execution with MCP](https://www.anthropic.com/engineering/code-execution-with-mcp), we follow these principles:

1. **Minimize tool count**: Too many tools overload the context window and reduce agent efficiency
2. **Generic over specific**: Prefer one flexible `wp_cli` tool over dozens of specialized tools (`get_plugins`, `update_plugin`, etc.)
3. **Let WP-CLI do the work**: WP-CLI is a well-documented API that AI models already understand

### Why This Matters

| Approach | Token Cost | Maintenance |
|----------|------------|-------------|
| 50 specialized tools | ~150,000 tokens | High - each tool needs updates |
| 3 generic tools + WP-CLI | ~2,000 tokens | Low - WP-CLI handles complexity |

### Current Tools (Keep Minimal)

| Tool | Purpose |
|------|---------|
| `list_servers` | List configured WordPress servers |
| `test_ssh_connection` | Verify SSH connectivity |
| `wp_cli` | Execute any WP-CLI command |
| `list_skills` | List available WordPress plugin skills |
| `read_skill` | Read skill instructions and available scripts |
| `run_skill_script` | Execute a script from a skill |

**Do NOT create specialized tools** like `get_plugins`, `update_theme`, `create_user`, etc. Use `wp_cli` instead.

For plugin-specific functionality, create a **skill** instead of a tool. See the Skills System section below.

## Skills Catalog

This project uses [Anthropic's Agent Skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills) pattern for progressive disclosure of context.

### Development Skills

Skills for AI agents working on this codebase:

| Skill Name | Description | Path |
|------------|-------------|------|
| creating-skills-and-tools | Guidelines for creating new Agent Skills and MCP tools for this WordPress MCP server | `.github/skills/creating-skills-and-tools/SKILL.md` |

### WordPress Plugin Skills

Skills for managing WordPress plugins on remote sites. Discovered via `list_skills` tool:

| Skill ID | Description |
|----------|-------------|
| `formidable-forms` | Manage Formidable Forms - list forms, get form details/fields, retrieve entries |

### How to Use Skills

**For development tasks** (working on this codebase):
1. Read the skill file at the listed path
2. Follow any guidance, standards, or templates provided
3. Read additional referenced files only as needed (progressive disclosure)

**For WordPress plugin tasks** (managing remote sites):
1. Call `list_skills` to see available plugin skills
2. Call `read_skill` with the skill ID to get instructions and available scripts
3. Call `run_skill_script` to execute scripts with the target domain

## Skills System Architecture

The skills system enables progressive disclosure of plugin-specific functionality:

```
src/skills/
├── index.ts              # Skill discovery and loading
├── types.ts              # TypeScript types for skills
└── formidable-forms/     # Example skill
    ├── SKILL.md          # Instructions for AI agents
    └── scripts/          # Executable scripts
        ├── list-forms.ts
        ├── get-form.ts
        └── get-entries.ts
```

### Creating a New Skill

1. Create a directory in `src/skills/` with the skill ID (lowercase, hyphens)
2. Add a `SKILL.md` with YAML frontmatter:
   ```yaml
   ---
   name: my-plugin
   description: Brief description for AI agent discovery (max 1024 chars)
   ---
   
   # My Plugin
   
   Instructions, workflows, and documentation...
   ```
3. Add scripts in a `scripts/` subdirectory (optional)
4. Each script must export `definition` (metadata) and `execute` (function)

## Code Standards

### TypeScript

- Use ES modules (`import`/`export`)
- Strict TypeScript with proper typing
- Use `zod` for runtime validation in MCP tools

### MCP Server Structure

```
src/
├── index.ts              # MCP server entry point with tool registrations
├── config/
│   └── servers.json      # Server configurations (layered SSH config)
├── lib/
│   ├── types.ts          # TypeScript interfaces
│   └── ssh.ts            # SSH helper functions
└── skills/
    ├── index.ts          # Skill discovery and script execution
    ├── types.ts          # Skill type definitions
    └── {skill-id}/       # One directory per skill
        ├── SKILL.md      # Skill instructions
        └── scripts/      # Executable scripts
```

### SSH Configuration Inheritance

The `servers.json` uses a layered approach:
1. **Global** (`ssh`): Default SSH settings
2. **Provider** (`hostingProviders.*.ssh`): Hosting provider overrides
3. **Server** (`servers.*.ssh`): Per-server overrides

Higher levels override lower levels.

## Key Files

- `src/index.ts` - MCP server with tool definitions
- `src/lib/ssh.ts` - SSH connection and command execution
- `src/lib/types.ts` - TypeScript type definitions
- `src/config/servers.json` - Server configurations
- `.vscode/mcp.json` - VS Code MCP server configuration for testing

## Development Workflow

1. Edit TypeScript source in `src/`
2. The MCP server runs via `tsx` for hot-reload during development
3. Test tools directly through VS Code's MCP integration
4. Build with `pnpm build` for production

## References

- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [WP-CLI Commands](https://developer.wordpress.org/cli/commands/)
- [Anthropic: Code execution with MCP](https://www.anthropic.com/engineering/code-execution-with-mcp)
- [Anthropic: Agent Skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)
- [Anthropic: Code execution with MCP](https://www.anthropic.com/engineering/code-execution-with-mcp)
- [Anthropic: Agent Skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)
