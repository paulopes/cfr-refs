# cfr-refs

Generate styled, interactive HTML diagrams paired with CFR United States regulatory reference data.

Click any node in the rendered diagram to see the relevant cfr-refs (Code of Federal Regulations) text in a tooltip.

## Install

```bash
git clone git@github.com:paulopes/cfr-refs.git && cd cfr-refs
npm install
npm link
```

This makes `cfr-refs` and `mcp-cfr-refs` available as global commands.

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

> **Note:** You don't need to copy the cfr-refs.js file because after typing `npm link` you made two globaly available commands:
- `cfr-refs` to run the generator script from any directory;
- `mcp-cfr-refs` to create a local project .mcp.json file for generic MCP clients or optionally to add this tool as an MCP server to popular MCP clients.

Then in any Claude Code session, run `/cfr-refs` and describe the regulatory workflow you want to diagram.

## Claude.ai Project Skill

You can also use cfr-refs as a skill in a [Claude.ai](https://claude.ai) chat project (the online version, not Claude Code). See [INSTALLING-ONLINE-PROJECT-SKILL.md](INSTALLING-ONLINE-PROJECT-SKILL.md) for setup and usage instructions in a chat browser environment.


## MCP Tool

cfr-refs is also available as an [MCP](https://modelcontextprotocol.io/) server, exposing a `generate-cfr-refs-diagram` tool that any MCP-compatible client can call.

You may be asking: Why would you want to use the MCP tool in Claude Code instead of the skill? The reason is that the MCP tools is also an MCP app, which means that the result will be rendered in line with the chat.

### Setup

```bash
git clone git@github.com:paulopes/cfr-refs.git && cd cfr-refs
npm install
npm run build
```

### Running

**HTTP transport** (standalone server):
```bash
node main.mjs
```
The server listens on `http://localhost:3001/mcp` using Streamable HTTP. Set the `PORT` environment variable to change the port.

**stdio transport** (for native MCP clients):
```bash
node main.mjs --stdio
```

### Connecting from web apps on the same machine

When the server is running in HTTP mode, any web application on the same machine can connect to it at `http://localhost:3001/mcp` using the Streamable HTTP transport. CORS is enabled, so browser-based apps can call the `generate-cfr-refs-diagram` tool directly.

> **Note:** Cloud-hosted AI clients (e.g. Claude.ai, ChatGPT) make MCP connections from their own servers, not from your browser — so `localhost` won't work for those. You would need to expose the server via a tunnel (e.g. ngrok) or deploy it to a public host. In that case, consider adding authentication before exposing the server to the internet.

### Installing in native MCP clients

For native desktop clients like Claude Code, Claude Desktop, VS Code, Cursor, Windsurf, Gemini CLI, Antigravity, and others, the server runs over stdio and is registered in each client's configuration file. An automated installer is provided:

```bash
npm run install-mcp                  # local .mcp.json (default)
npm run install-mcp:claude-code
npm run install-mcp:claude-desktop
npm run install-mcp:vscode
npm run install-mcp:cursor
npm run install-mcp:windsurf
npm run install-mcp:antigravity
npm run install-mcp:antigravity-global
npm run install-mcp:gemini-cli
npm run install-mcp:gemini-cli-global
```

See [INSTALLING-MCP-SERVER-TOOL.md](INSTALLING-MCP-SERVER-TOOL.md) for full details, manual setup steps, config file locations, and instructions for other clients (including Goose).

The `generate-cfr-refs-diagram` tool accepts a `config` parameter (the same JSON schema described in [cfr-refs-SKILL.md](skill/cfr-refs-SKILL.md)) and returns a self-contained HTML diagram.

## MCP App

When used with an [MCP Apps](https://apps.extensions.modelcontextprotocol.io/api/)-capable host (Claude, ChatGPT, VS Code, etc.), the generated diagram renders **inline in the conversation** as an interactive view — no need to open a separate file.

The MCP App view is built automatically by `npm run build` and served as a `ui://` resource alongside the tool.

### Development

```bash
npm start
```

This starts both the MCP server and a Vite watcher that rebuilds the App view on changes.

## License

This project is licensed under the [Apache License 2.0](LICENSE).
