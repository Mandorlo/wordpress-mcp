# WordPress MCP Server

> **TL;DR**: An MCP server that gives AI assistants (Claude, Cursor, VS Code Copilot) full control over your WordPress sites via SSH. Run WP-CLI commands, execute PHP code, and manage plugins — all through natural conversation.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![MCP](https://img.shields.io/badge/MCP-1.x-green.svg)](https://modelcontextprotocol.io/)
[![License](https://img.shields.io/badge/License-ISC-yellow.svg)](LICENSE)

---

## 🎯 What is this?

This is a **Model Context Protocol (MCP) server** that connects AI assistants to your WordPress infrastructure. Instead of manually SSH'ing into servers and running commands, you can now ask your AI assistant to:

- *"List all plugins on staging.example.com"*
- *"Check the disk usage on my production server"*
- *"Get all Formidable Forms entries from last week"*
- *"Update all plugins and clear the cache"*

The AI handles the technical complexity while you focus on what matters.

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   AI Assistant  │────▶│  WordPress MCP  │────▶│ Your WordPress  │
│ (Claude, Cursor)│     │     Server      │     │    Sites (SSH)  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🔧 **WP-CLI Integration** | Execute any WP-CLI command on remote WordPress sites |
| 🐚 **SSH Commands** | Run bash commands for server management tasks |
| 🐘 **PHP Execution** | Run PHP code with full WordPress context |
| 🎯 **Skills System** | Plugin-specific capabilities (e.g., Formidable Forms) |
| 🔐 **SSH Key Auth** | Secure authentication via SSH keys |
| 🌐 **Multi-Server** | Manage multiple WordPress sites from one configuration |

---

## 🚀 Quick Start

### 1. Configure your servers

Create or edit `src/config/servers.json`:

```json
{
  "ssh": {
    "port": 22,
    "privateKeyPath": "~/.ssh/id_rsa"
  },
  "servers": {
    "example.com": {
      "name": "My WordPress Site",
      "ssh": {
        "username": "deploy",
        "host": "example.com"
      },
      "wpRootPath": "/var/www/html"
    }
  }
}
```

### 2. Connect to your AI assistant

<details>
<summary><strong>VS Code (Copilot Chat)</strong></summary>

Add to `.vscode/mcp.json` in your workspace:

```json
{
  "servers": {
    "wordpress": {
      "command": "node",
      "args": ["/path/to/wordpress-mcp/dist/index.js", "/path/to/servers.json"]
    }
  }
}
```

</details>

<details>
<summary><strong>Claude Desktop</strong></summary>

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "wordpress": {
      "command": "node",
      "args": ["/path/to/wordpress-mcp/dist/index.js", "/path/to/servers.json"]
    }
  }
}
```

</details>

<details>
<summary><strong>Cursor</strong></summary>

Add to your Cursor MCP settings:

```json
{
  "mcpServers": {
    "wordpress": {
      "command": "node",
      "args": ["/path/to/wordpress-mcp/dist/index.js", "/path/to/servers.json"]
    }
  }
}
```

</details>

### 3. Build from source (if needed)

If you don't have the built server yet:

```bash
git clone https://github.com/Mandorlo/wordpress-mcp.git
cd wordpress-mcp
npm install && npm run build
```

---

## 🛠️ Available Tools

### Core Tools

| Tool | Description |
|------|-------------|
| `search_servers` | Find WordPress servers by name or domain |
| `test_ssh_connection` | Verify SSH connectivity to a server |
| `wp_cli` | Execute any WP-CLI command |
| `ssh_run_command` | Run bash commands via SSH |
| `run_php_code` | Execute PHP code on WordPress sites |

### Skills Tools

| Tool | Description |
|------|-------------|
| `list_skills` | Discover available plugin skills |
| `read_skill` | Get detailed instructions for a skill |
| `run_skill_script` | Execute a skill-specific script |

---

## 📦 Skills System

Skills are plugin-specific capabilities that extend the server with specialized workflows. Think of them as "expert knowledge" for particular WordPress plugins.

### Available Skills

| Skill | Description |
|-------|-------------|
| `formidable-forms` | Manage Formidable Forms — list forms, get form details/fields, retrieve entries |

### Using Skills

```
You: "List all forms on staging.mysite.com"

AI: I'll use the formidable-forms skill to get the forms...
    [Executes run_skill_script with skillId="formidable-forms", script="list-forms"]
    
    Found 3 forms:
    • Contact Form (ID: 1)
    • Newsletter Signup (ID: 2) 
    • Support Request (ID: 3)
```

### Creating Custom Skills

Skills follow [Anthropic's Agent Skills pattern](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills) for progressive disclosure. See [`.github/copilot-instructions.md`](.github/copilot-instructions.md) for guidelines.

---

## 🏗️ Architecture

### Design Philosophy

This server follows the principle of **"less is more"** from [Anthropic's MCP best practices](https://www.anthropic.com/engineering/code-execution-with-mcp):

- **Few generic tools** instead of many specialized ones
- **Let WP-CLI do the work** — it's already a powerful, well-documented API
- **Skills for complexity** — plugin-specific logic when needed

| Approach | Token Cost | Maintenance |
|----------|------------|-------------|
| 50 specialized tools | ~150,000 tokens | High |
| 6 generic tools + WP-CLI | ~2,000 tokens | Low ✓ |

### Project Structure

```
src/
├── index.ts              # MCP server & tool registrations
├── config/
│   └── servers.json      # Server configurations
├── lib/
│   ├── ssh.ts            # SSH connection handling
│   └── types.ts          # TypeScript types
└── skills/
    ├── index.ts          # Skill discovery & execution
    └── formidable-forms/ # Example skill
        ├── SKILL.md      # Skill documentation
        └── scripts/      # Executable scripts
```

### SSH Configuration Inheritance

```
Global defaults (ssh) 
    ↓ overrides ↓
Hosting provider (hostingProviders.*.ssh)
    ↓ overrides ↓
Individual server (servers.*.ssh)
```

---

## 🔒 Security Considerations

- **SSH Key Authentication** — No passwords stored, uses SSH keys
- **Scoped Access** — Each server configuration defines exactly what's accessible
- **Local Execution** — MCP server runs locally, connecting out to your servers
- **Read the Commands** — AI assistants show you what they're about to execute

> ⚠️ **Important**: This tool gives AI assistants shell access to your servers. Use appropriate SSH keys with limited permissions for production environments.

---

## 🤝 Contributing

We welcome contributions! Here's how to help:

1. **Report bugs** — Open an issue with reproduction steps
2. **Suggest features** — Describe your use case in an issue
3. **Add skills** — Create skills for other WordPress plugins
4. **Improve docs** — PRs for documentation are always welcome

See the [contributing guidelines](.github/copilot-instructions.md) for development setup.

---

## 📚 Resources

- [Model Context Protocol](https://modelcontextprotocol.io/) — The protocol specification
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) — SDK we're built on
- [WP-CLI Commands](https://developer.wordpress.org/cli/commands/) — All available WP-CLI commands
- [Anthropic's Agent Skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills) — Pattern for skill system

---

## 📄 License

ISC License — See [LICENSE](LICENSE) for details.

---

<p align="center">
  <sub>Built with ❤️ for the WordPress community</sub>
</p>
