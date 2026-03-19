# cfr-refs — MCP App Installation Guide

An MCP server that exposes cfr-refs as a tool with an interactive UI. When called from any MCP-compatible client (Claude Code, Claude Desktop, VS Code, Cursor, Windsurf, and others), the generated regulatory diagram renders **inline in the conversation** — clickable nodes, CFR tooltips, acronym expansions, and all.

## What It Does

You ask Claude to create a regulatory diagram, and it calls the `generate-crf-refs-diagram` tool on your local MCP server. The tool returns a self-contained HTML diagram, and the MCP App view renders it directly in the chat — no need to open a separate file.

All eight layout types are supported: `events`, `timeline`, `lifecycle`, `lifecycle-t`, `flowchart`, `sequence`, `state`, and `gantt`.

## Quick Install (Automated)

Clone the repo, install dependencies, build, then run the installer:

```bash
git clone git@github.com:paulopes/cfr-refs.git && cd cfr-refs
npm install
npm run build
npm run install-mcp
```

This defaults to **Claude Code**. To install for a different client:

```bash
npm run install-mcp:vscode
npm run install-mcp:claude-desktop
npm run install-mcp:cursor
npm run install-mcp:windsurf
```

Run `npm run install-mcp -- --list` to see all supported clients and their config file locations.

The installer verifies that `npm install` and `npm run build` have already been run, and registers the MCP server in the target client's config.

## Manual Setup

### 1. Clone and build

```bash
git clone git@github.com:paulopes/cfr-refs.git && cd cfr-refs
npm install
npm run build
```

The build step bundles the MCP App view into `dist/mcp-app.html`.

### 2. Register the MCP server

Add the server entry to your client's MCP configuration file:

| Client | Config file | Servers key |
|--------|------------|-------------|
| Claude Code | `~/.claude/.mcp.json` (global) | `mcpServers` |
| Claude Desktop | `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows) | `mcpServers` |
| VS Code (Copilot) | `.vscode/mcp.json` (project root) | `servers` |
| Cursor | `~/.cursor/mcp.json` | `mcpServers` |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` | `mcpServers` |

**Example (Claude Code / Claude Desktop / Cursor / Windsurf):**
```json
{
  "mcpServers": {
    "cfr-refs": {
      "command": "node",
      "args": ["/absolute/path/to/cfr-refs/main.mjs", "--stdio"]
    }
  }
}
```

**Example (VS Code):**
```json
{
  "servers": {
    "cfr-refs": {
      "command": "node",
      "args": ["/absolute/path/to/cfr-refs/main.mjs", "--stdio"]
    }
  }
}
```

Replace `/absolute/path/to/cfr-refs` with the actual path where you cloned the repo.

**Windows example:**
```json
{
  "mcpServers": {
    "cfr-refs": {
      "command": "node",
      "args": ["C:\\Users\\you\\cfr-refs\\main.mjs", "--stdio"]
    }
  }
}
```

### Other clients (e.g. Goose)

Any MCP-compatible client can use cfr-refs — you just need to add the server entry in that client's configuration format. For example, **Goose** uses YAML (`~/.config/goose/config.yaml`):

```yaml
extensions:
  cfr-refs:
    command: node
    args:
      - /absolute/path/to/cfr-refs/main.mjs
      - --stdio
```

The key information is always the same — `node` as the command, and the absolute path to `main.mjs` with `--stdio` as arguments. Consult your client's documentation for the exact config file location and format.

### 3. Enable the server (Claude Code only)

Claude Code requires the server to be listed in `enabledMcpjsonServers` in `~/.claude/settings.json`. The generated diagrams can also exceed the default 25 000-token MCP output limit, so you should raise `MAX_MCP_OUTPUT_TOKENS`:

```json
{
  "enabledMcpjsonServers": ["cfr-refs"],
  "env": {
    "MAX_MCP_OUTPUT_TOKENS": "75000"
  }
}
```

If `enabledMcpjsonServers` already exists, add `"cfr-refs"` to the array. The automated installer (`npm run install-mcp`) does both of these automatically.

### 4. Restart the client

After registering the server, **fully quit** your client and relaunch it. For Claude Code, closing the window is not enough — you must quit the application entirely (e.g. `Ctrl+Q` or right-click the system tray icon → Quit).

### 5. Verify

In a Claude Code session, ask:

> "What tools do you have?"

You should see `generate-crf-refs-diagram` in the list. If you also have the cfr-refs skill installed, Claude will know when and how to use it automatically.

## Usage

Ask Claude to create a regulatory diagram. For example:

> "Create a lifecycle diagram for the E-Rate program under 47 CFR Part 54 Subpart F."

Claude will:

1. Research the relevant CFR sections
2. Build the JSON config following the cfr-refs schema
3. Call the `generate-crf-refs-diagram` MCP tool with the config
4. The diagram renders inline — click any node to see the CFR text

You can also provide a config object directly:

> "Generate a diagram from this config: { ... }"

## How It Works

The MCP server registers two things:

| Component | URI / Name | Purpose |
|-----------|-----------|---------|
| **Tool** | `generate-crf-refs-diagram` | Accepts a cfr-refs JSON config, returns self-contained HTML |
| **UI Resource** | `ui://cfr-refs/mcp-app.html` | Bundled MCP App view that renders the HTML in an iframe |

When an MCP Apps-capable host (Claude Code, Claude Desktop, ChatGPT, VS Code) calls the tool, it also reads the `_meta.ui.resourceUri` to fetch the view. The view receives the tool result and renders the diagram inline in the conversation, inside a sandboxed iframe.

Hosts that don't support MCP Apps still get the full HTML as text content — Claude can save it as a file or provide it as a download.

## Combining with the Skill

For the best experience, install **both** the MCP server and the cfr-refs skill:

- The **skill** (`cfr-refs-SKILL.md`) teaches Claude the full JSON schema, layout selection heuristics, quality checklist, and color conventions
- The **MCP server** gives Claude the ability to generate and render diagrams directly

With both installed, Claude knows *what* to build (from the skill) and *how* to render it (via the tool).

To install the skill in Claude Code:

```bash
mkdir -p ~/.claude/skills/cfr-refs
cp skill/cfr-refs-SKILL.md ~/.claude/skills/cfr-refs/SKILL.md
```

**Windows (PowerShell):**
```powershell
mkdir -Force "$env:USERPROFILE\.claude\skills\cfr-refs"
copy skill\cfr-refs-SKILL.md "$env:USERPROFILE\.claude\skills\cfr-refs\SKILL.md"
```

## Development

To work on the MCP App view with live reload:

```bash
npm start
```

This runs both `vite build --watch` (rebuilds the view on changes) and the MCP server with `--watch` (restarts on server code changes).

## Requirements

- Node.js 18+
- An MCP-compatible client (Claude Code, Claude Desktop, VS Code, ChatGPT, etc.)
- `npm install` and `npm run build` must be run before first use

## Known Limitations

### VS Code MCP tool output size

VS Code imposes a hard byte limit on MCP tool output that **cannot be configured** by the user. Complex diagrams with many CFR sections and lengthy quoted text may be truncated. The library API automatically minifies the HTML output to reduce byte count, but very large diagrams may still exceed the limit. If you encounter truncation in VS Code, consider reducing the number of `defined` entries or shortening the quoted text.

Claude Code has a similar limit (`MAX_MCP_OUTPUT_TOKENS`, default 25 000 tokens) but it **can** be increased — the automated installer sets it to 75 000 in `~/.claude/settings.json`.
