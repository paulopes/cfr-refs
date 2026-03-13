# cfr-refs

Generate styled, interactive HTML diagrams paired with CFR United States regulatory reference data.

Click any node in the rendered diagram to see the relevant cfr-refs (Code of Federal Regulations) text in a tooltip.

## Install

```bash
git clone git@github.com:paulopes/cfr-refs.git && cd cfr-refs
npm install
npm link
```

This makes `cfr-refs` available as a global command.

## Usage

```bash
cfr-refs <config.json> [--output <file.html>]
```
Options:
  - `-o, --output` <file>   Output HTML file (default: derived from config filename)
  - `-h, --help`            Show usage help


    > **Note:** If `--output` (or `-o`) is omitted, the output filename is derived from the config filename (e.g. `contributions.json` → `contributions.html`).

### Example

```bash
cfr-refs contributions.json
```

## Config File

The JSON config defines the diagram type, content, and metadata. Please see the [cfr-refs-SKILL.md](skill/cfr-refs-SKILL.md) file for details.

## Output

A self-contained HTML file with:

- An interactive diagram that is partially rendered client-side
- Clickable nodes that display cfr-refs reference popups and acronym tooltips

## Claude Code Skill

You can install cfr-refs as a [Claude Code skill](https://docs.anthropic.com/en/docs/claude-code) so that `/cfr-refs` generates new diagram sets from a description.

Copy the `skill/cfr-refs-SKILL.md` file into your Claude Code skills directory inside a `cfr-refs` subdirectory:

**macOS / Linux:**
```bash
mkdir -p ~/.claude/skills/cfr-refs
cp skill/cfr-refs-SKILL.md ~/.claude/skills/cfr-refs/SKILL.md
```

**Windows (PowerShell):**
```powershell
mkdir -Force "$env:USERPROFILE\.claude\skills\cfr-refs"
copy skill\cfr-refs-SKILL.md "$env:USERPROFILE\.claude\skills\cfr-refs\SKILL.md"
```

> **Note:** You don't need to copy the cfr-refs.js file because after typing `npm link` you made `cfr-refs` a globally available command in your machine.

Then in any Claude Code session, run `/cfr-refs` and describe the regulatory workflow you want to diagram.

## Claude.ai Project Skill

You can also use cfr-refs as a skill in a [Claude.ai](https://claude.ai) chat project (the online version, not Claude Code). See [INSTALL-ONLINE-PROJECT-SKILL.md](INSTALL-ONLINE-PROJECT-SKILL.md) for setup and usage instructions in that chat environment.

## MCP Tool

cfr-refs is also available as an [MCP](https://modelcontextprotocol.io/) server, exposing a `generate-diagram` tool that any MCP-compatible client can call.

### Setup

```bash
git clone git@github.com:paulopes/cfr-refs.git && cd cfr-refs
npm install
npm run build
```

### Running

**HTTP transport** (for Claude Desktop, web clients, etc.):
```bash
node main.mjs
```
The server listens on `http://localhost:3001/mcp` by default. Set the `PORT` environment variable to change the port.

**stdio transport** (for VS Code, Claude Code, etc.):
```bash
node main.mjs --stdio
```

### MCP Client Configuration

Add to your MCP client settings (e.g. Claude Desktop `claude_desktop_config.json` or VS Code `settings.json`):

```json
{
  "mcpServers": {
    "cfr-refs": {
      "command": "node",
      "args": ["<path-to-cfr-refs>/main.mjs", "--stdio"]
    }
  }
}
```

The `generate-diagram` tool accepts a `config` parameter (the same JSON schema described in [cfr-refs-SKILL.md](skill/cfr-refs-SKILL.md)) and returns a self-contained HTML diagram.

## MCP App

When used with an [MCP Apps](https://apps.extensions.modelcontextprotocol.io/api/)-capable host (Claude, ChatGPT, VS Code, etc.), the generated diagram renders **inline in the conversation** as an interactive view — no need to open a separate file.

The MCP App view is built automatically by `npm run build` and served as a `ui://` resource alongside the tool.

### Development

```bash
npm start
```

This starts both the MCP server and a Vite watcher that rebuilds the App view on changes.

## License

This project is licensed under the [Apache License 2.0](LICENSE) License.
